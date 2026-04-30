/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { Readable } = require("stream");
const express = require("express");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const LMSTUDIO_BASE_URL = String(process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1").replace(/\/+$/, "");
const LMSTUDIO_API_KEY = process.env.LMSTUDIO_API_KEY ? String(process.env.LMSTUDIO_API_KEY) : "";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ? String(process.env.MISTRAL_API_KEY) : "";
const MISTRAL_BASE_URL = String(process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1").replace(/\/+$/, "");
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ? String(process.env.OPENROUTER_API_KEY) : "";
const OPENROUTER_BASE_URL = String(process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const POLYBUZZ_COOKIE = process.env.POLYBUZZ_COOKIE ? String(process.env.POLYBUZZ_COOKIE) : "";

function stripSlashes(u) {
  return String(u || "").replace(/\/+$/, "");
}

function deriveRestBaseUrl(baseUrl) {
  const base = stripSlashes(baseUrl);
  if (base.endsWith("/api/v1")) return base.slice(0, -"/api/v1".length);
  if (base.endsWith("/v1")) return base.slice(0, -"/v1".length);
  return base;
}

function deriveOpenAiBaseUrl(baseUrl) {
  const restBase = deriveRestBaseUrl(baseUrl);
  return stripSlashes(restBase) + "/v1";
}

const LMSTUDIO_REST_BASE_URL = deriveRestBaseUrl(LMSTUDIO_BASE_URL);
const LMSTUDIO_OPENAI_BASE_URL = deriveOpenAiBaseUrl(LMSTUDIO_BASE_URL);

app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    lmstudioBaseUrl: LMSTUDIO_BASE_URL,
    lmstudioRestBaseUrl: LMSTUDIO_REST_BASE_URL,
    lmstudioOpenAiBaseUrl: LMSTUDIO_OPENAI_BASE_URL,
    mistralBaseUrl: MISTRAL_BASE_URL,
    openrouterBaseUrl: OPENROUTER_BASE_URL
  });
});

app.get("/api/video/preview", async (req, res) => {
  try {
    const rawUrl = String(req.query.url || "").trim();
    if (!rawUrl) {
      res.status(400).json({ error: "Missing url query param" });
      return;
    }
    let videoUrl;
    try {
      videoUrl = new URL(rawUrl);
    } catch (_err) {
      res.status(400).json({ error: "Invalid url" });
      return;
    }

    const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(videoUrl.toString())}`;
    const upstream = await fetch(endpoint, { method: "GET" });
    const data = await upstream.json();
    if (!upstream.ok || data.error) {
      res.status(404).json({ error: data.error || "Preview unavailable" });
      return;
    }
    res.json({
      url: videoUrl.toString(),
      type: data.type || "",
      provider_name: data.provider_name || "",
      author_name: data.author_name || "",
      title: data.title || "",
      thumbnail_url: data.thumbnail_url || "",
      width: Number(data.width) || null,
      height: Number(data.height) || null,
      duration: Number(data.duration) || null
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to load video preview", details: String(err) });
  }
});

function upstreamHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };
  if (LMSTUDIO_API_KEY) headers.Authorization = `Bearer ${LMSTUDIO_API_KEY}`;
  return headers;
}

app.get("/api/lmstudio/models", async (_req, res) => {
  try {
    // Prefer native REST v1 models; fall back to OpenAI-compatible /v1/models.
    let upstream = await fetch(`${LMSTUDIO_REST_BASE_URL}/api/v1/models`, {
      method: "GET",
      headers: upstreamHeaders()
    });

    if (upstream.status === 404) {
      upstream = await fetch(`${LMSTUDIO_OPENAI_BASE_URL}/models`, {
        method: "GET",
        headers: upstreamHeaders()
      });
    }

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    console.error("[models]", err);
    res.status(502).json({
      error: "LM Studio недоступна. Проверьте, что сервер запущен.",
      details: String(err)
    });
  }
});

function proxyStream(targetUrl, jsonPayload, headers, res) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === "https:" ? https : http;
    const data = JSON.stringify(jsonPayload);

    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        ...headers,
        Accept: "text/event-stream",
        "Content-Length": Buffer.byteLength(data)
      }
    };

    const upstream = transport.request(opts, (upstreamRes) => {
      const status = upstreamRes.statusCode || 502;
      const contentType = upstreamRes.headers["content-type"] || "";
      const isEventStream = String(contentType).includes("text/event-stream");

      res.status(status);
      if (contentType) res.setHeader("Content-Type", contentType);

      if (isEventStream) {
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
      }

      if (typeof res.flushHeaders === "function") res.flushHeaders();

      // Abort upstream if client disconnects.
      res.on("close", () => {
        upstream.destroy();
        upstreamRes.destroy();
      });

      upstreamRes.on("error", (err) => {
        console.error("[chat stream]", err);
        res.end();
        resolve();
      });

      upstreamRes.pipe(res);

      upstreamRes.on("end", () => {
        resolve();
      });
    });

    upstream.on("error", (err) => {
      reject(err);
    });

    upstream.write(data);
    upstream.end();
  });
}

app.post("/api/lmstudio/chat", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const wantStream = body.stream === true;

    const isRestMode =
      body.api === "rest" ||
      Object.prototype.hasOwnProperty.call(body, "input") ||
      Object.prototype.hasOwnProperty.call(body, "system_prompt") ||
      Object.prototype.hasOwnProperty.call(body, "previous_response_id");

    if (isRestMode) {
      const payload = {
        model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : "local-model",
        input: body.input,
        system_prompt: typeof body.system_prompt === "string" ? body.system_prompt : undefined,
        previous_response_id:
          typeof body.previous_response_id === "string" && body.previous_response_id.trim()
            ? body.previous_response_id.trim()
            : undefined,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
        top_p: typeof body.top_p === "number" ? body.top_p : undefined,
        top_k: typeof body.top_k === "number" ? body.top_k : undefined,
        repeat_penalty: typeof body.repeat_penalty === "number" ? body.repeat_penalty : undefined,
        max_output_tokens: typeof body.max_output_tokens === "number" ? body.max_output_tokens : undefined,
        context_length: typeof body.context_length === "number" ? body.context_length : undefined,
        reasoning: typeof body.reasoning === "string" ? body.reasoning : undefined,
        store: typeof body.store === "boolean" ? body.store : true,
        stream: wantStream
      };

      if (wantStream) {
        await proxyStream(`${LMSTUDIO_REST_BASE_URL}/api/v1/chat`, payload, upstreamHeaders(), res);
        return;
      }

      const upstream = await fetch(`${LMSTUDIO_REST_BASE_URL}/api/v1/chat`, {
        method: "POST",
        headers: upstreamHeaders(),
        body: JSON.stringify(payload)
      });

      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      res.send(text);
      return;
    }

    const payload = {
      model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : "local-model",
      messages: Array.isArray(body.messages) ? body.messages : [],
      temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
      stream: wantStream
    };

    if (wantStream) {
      await proxyStream(
        `${LMSTUDIO_OPENAI_BASE_URL}/chat/completions`,
        payload,
        upstreamHeaders(),
        res
      );
      return;
    }

    const upstream = await fetch(`${LMSTUDIO_OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: upstreamHeaders(),
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    console.error("[chat]", err);
    res.status(502).json({ error: "Не удалось получить ответ от LM Studio", details: String(err) });
  }
});

function mistralHeaders(apiKey) {
  const key = apiKey || MISTRAL_API_KEY;
  const headers = {
    "Content-Type": "application/json"
  };
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

const MISTRAL_FALLBACK_MODELS = [
  { id: "codestral-latest", name: "Codestral" },
  { id: "devstral-latest", name: "Devstral" },
  { id: "devstral-medium-latest", name: "Devstral Medium" },
  { id: "devstral-small-latest", name: "Devstral Small" },
  { id: "magistral-medium-latest", name: "Magistral Medium" },
  { id: "magistral-small-latest", name: "Magistral Small" }
];

// --- Mistral API integration ---

app.get("/api/mistral/models", async (req, res) => {
  const clientKey = req.headers["x-mistral-key"] || "";
  const key = clientKey || MISTRAL_API_KEY;
  if (!key) {
    res.status(401).json({ error: "Mistral API key required" });
    return;
  }

  try {
    const upstream = await fetch(`${MISTRAL_BASE_URL}/models`, {
      method: "GET",
      headers: mistralHeaders(clientKey)
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      res.send(text);
      return;
    }

    try {
      const data = JSON.parse(text);
      const models = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      if (!models.length) {
        res.json({ data: MISTRAL_FALLBACK_MODELS });
        return;
      }
    } catch {
      // If parsing fails, fall back to raw text below.
    }

    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    console.error("[mistral models]", err);
    res.status(502).json({ error: "Не удалось получить список моделей Mistral", details: String(err), data: MISTRAL_FALLBACK_MODELS });
  }
});

app.post("/api/mistral/chat", async (req, res) => {
  const clientKey = req.headers["x-mistral-key"] || "";
  const key = clientKey || MISTRAL_API_KEY;
  if (!key) {
    res.status(401).json({ error: "Mistral API key required" });
    return;
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const wantStream = body.stream === true;

    const payload = {
      model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : "mistral-small-latest",
      messages: Array.isArray(body.messages) ? body.messages : [],
      temperature: typeof body.temperature === "number" ? body.temperature : 0.75,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
      stream: wantStream
    };

    if (wantStream) {
      await proxyStream(
        `${MISTRAL_BASE_URL}/chat/completions`,
        payload,
        mistralHeaders(clientKey),
        res
      );
      return;
    }

    const upstream = await fetch(`${MISTRAL_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: mistralHeaders(clientKey),
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    console.error("[mistral chat]", err);
    res.status(502).json({ error: "Не удалось получить ответ от Mistral", details: String(err) });
  }
});

function openrouterHeaders(apiKey) {
  const key = apiKey || OPENROUTER_API_KEY;
  const headers = {
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost",
    "X-OpenRouter-Title": "NLMW Chat Studio"
  };
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

const OPENROUTER_FALLBACK_MODELS = [
  { id: "openrouter/auto", name: "OpenRouter Auto" },
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B Instruct (free)" },
  { id: "google/gemma-2-9b-it:free", name: "Gemma 2 9B IT (free)" },
  { id: "mistralai/mistral-7b-instruct:free", name: "Mistral 7B Instruct (free)" }
];

// --- OpenRouter API integration ---

app.get("/api/openrouter/models", async (req, res) => {
  const clientKey = req.headers["x-openrouter-key"] || "";

  try {
    const upstream = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      method: "GET",
      headers: openrouterHeaders(clientKey)
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      res.send(text);
      return;
    }

    try {
      const data = JSON.parse(text);
      const models = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      if (!models.length) {
        res.json({ data: OPENROUTER_FALLBACK_MODELS });
        return;
      }
    } catch {
      // If parsing fails, fall back to raw text below.
    }

    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    console.error("[openrouter models]", err);
    res.json({
      warning: "Не удалось получить список моделей OpenRouter, используется резервный список",
      details: String(err),
      data: OPENROUTER_FALLBACK_MODELS
    });
  }
});

app.post("/api/openrouter/chat", async (req, res) => {
  const clientKey = req.headers["x-openrouter-key"] || "";
  const key = clientKey || OPENROUTER_API_KEY;
  if (!key) {
    res.status(401).json({ error: "OpenRouter API key required" });
    return;
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const wantStream = body.stream === true;

    const payload = {
      model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : "openrouter/auto",
      messages: Array.isArray(body.messages) ? body.messages : [],
      temperature: typeof body.temperature === "number" ? body.temperature : 0.75,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
      stream: wantStream
    };

    if (wantStream) {
      await proxyStream(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        payload,
        openrouterHeaders(clientKey),
        res
      );
      return;
    }

    const upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: openrouterHeaders(clientKey),
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    console.error("[openrouter chat]", err);
    res.status(502).json({ error: "Не удалось получить ответ от OpenRouter", details: String(err) });
  }
});

function decodeHtmlEntities(s) {
  const map = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };

  return String(s || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, p1) => {
    if (!p1) return m;
    const key = String(p1);
    if (key[0] === "#") {
      const isHex = key[1] === "x" || key[1] === "X";
      const numStr = isHex ? key.slice(2) : key.slice(1);
      const code = parseInt(numStr, isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }

    const named = map[key.toLowerCase()];
    return named !== undefined ? named : m;
  });
}

function extractMetaContent(html, metaKey) {
  const key = String(metaKey || "").trim();
  if (!key) return "";

  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagRe = new RegExp(`<meta\\s+[^>]*(?:property|name)\\s*=\\s*["']${esc}["'][^>]*>`, "i");
  const tag = String(html || "").match(tagRe)?.[0] || "";
  if (!tag) return "";

  const m = tag.match(/content\\s*=\\s*["']([^"']*)["']/i);
  return m ? decodeHtmlEntities(m[1]).trim() : "";
}

function extractTagText(html, tagName) {
  const t = String(tagName || "").trim().toLowerCase();
  if (!t) return "";
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${esc}[^>]*>([\\s\\S]*?)<\\/${esc}>`, "i");
  const m = String(html || "").match(re);
  if (!m) return "";
  return decodeHtmlEntities(String(m[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, "\n");
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|tr|section)\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeHtmlEntities(s);
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/[ \\t]+/g, " ");
  s = s.replace(/\n\s+\n/g, "\n\n");
  return s;
}

function normalizeLine(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[.:：]+$/g, "");
}

function splitLines(text) {
  return String(text || "")
    .split("\n")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function pickSection(lines, labels, stopLabels, maxLines = 6) {
  const want = new Set((Array.isArray(labels) ? labels : []).map(normalizeLine));
  if (want.size === 0) return "";
  const stop = stopLabels instanceof Set ? stopLabels : new Set();

  for (let i = 0; i < lines.length; i++) {
    if (!want.has(normalizeLine(lines[i]))) continue;

    const out = [];
    for (let j = i + 1; j < lines.length && out.length < maxLines; j++) {
      const l = String(lines[j] || "").trim();
      if (!l) continue;
      const nl = normalizeLine(l);
      if (want.has(nl) || stop.has(nl)) break;
      if (/^you'?ve reached the view limit/i.test(l) || /view limit/i.test(l)) break;
      out.push(l);
    }
    return out.join("\n").trim();
  }

  return "";
}

function normalizeTitle(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t
    .replace(/\s*\|\s*polybuzz.*$/i, "")
    .replace(/^chat\s+with\s+/i, "")
    .trim();
}

function isAllowedPolybuzzUrl(rawUrl) {
  let u = null;
  try {
    u = new URL(String(rawUrl || ""));
  } catch {
    return null;
  }

  if (u.username || u.password) return null;
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const host = String(u.hostname || "").toLowerCase();
  if (!(host === "polybuzz.ai" || host.endsWith(".polybuzz.ai"))) return null;

  // Avoid weird ports / local pivots.
  if (u.port && u.port !== "80" && u.port !== "443") return null;

  return u;
}

function extractPolybuzzSecretSceneId(u) {
  try {
    const url = u instanceof URL ? u : new URL(String(u || ""));

    const qp =
      url.searchParams.get("CID") ||
      url.searchParams.get("cid") ||
      url.searchParams.get("secretSceneID") ||
      url.searchParams.get("secretSceneId");
    if (qp && /^[a-zA-Z0-9]{3,32}$/.test(qp)) return qp;

    const parts = String(url.pathname || "").split("/").filter(Boolean);
    if (parts.length === 0) return "";

    let slug = parts[parts.length - 1] || "";
    slug = decodeURIComponent(slug);

    // Common: /character/profile/hannah-JTybS
    if (slug.includes("-")) slug = slug.split("-").pop() || slug;

    const id = slug.replace(/[^a-zA-Z0-9]/g, "");
    if (!/^[a-zA-Z0-9]{3,32}$/.test(id)) return "";
    return id;
  } catch {
    return "";
  }
}

function polybuzzBaseHeaders({ accept = "application/json" } = {}) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    Accept: accept,
    "Accept-Language": "ru,en;q=0.8",
    Referer: "https://www.polybuzz.ai/",
    Origin: "https://www.polybuzz.ai"
  };
  if (POLYBUZZ_COOKIE) headers.Cookie = POLYBUZZ_COOKIE;
  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function shouldRetryPolybuzzError(err) {
  const msg = String(err?.message || err || "");
  return (
    /\(5002\)/.test(msg) || // system busy now
    /HTTP (429|502|503|504)\b/.test(msg) ||
    /timeout/i.test(msg) ||
    /fetch failed/i.test(msg) ||
    /ECONNRESET/i.test(msg) ||
    /ETIMEDOUT/i.test(msg)
  );
}

async function withRetry(fn, { retries = 3, baseDelayMs = 450 } = {}) {
  let lastErr = null;
  const n = Math.max(0, Number(retries) || 0);

  for (let attempt = 0; attempt <= n; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= n || !shouldRetryPolybuzzError(err)) throw err;
      const jitter = Math.floor(Math.random() * 150);
      const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
      await sleep(delay);
    }
  }

  throw lastErr;
}

async function fetchJsonOrThrow(url, opts, ctx, { timeoutMs = 15_000 } = {}) {
  const timeout = Math.max(1_000, Number(timeoutMs) || 15_000);
  let signal = opts && opts.signal ? opts.signal : undefined;
  let timeoutSignal = undefined;

  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    timeoutSignal = AbortSignal.timeout(timeout);
  }

  if (timeoutSignal) {
    if (signal && typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
      signal = AbortSignal.any([signal, timeoutSignal]);
    } else if (!signal) {
      signal = timeoutSignal;
    }
  }

  let r;
  try {
    r = await fetch(url, { ...(opts || {}), signal });
  } catch (err) {
    if (err && err.name === "AbortError") throw new Error(`${ctx}: timeout after ${timeout}ms`);
    throw err;
  }

  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    const snippet = text.slice(0, 400);
    throw new Error(`${ctx}: invalid JSON (HTTP ${r.status}). ${snippet}`);
  }

  if (!r.ok) {
    const msg =
      data && typeof data === "object" && (data.errMsg || data.message)
        ? String(data.errMsg || data.message)
        : text.slice(0, 400);
    throw new Error(`${ctx}: HTTP ${r.status}. ${msg}`);
  }

  return { status: r.status, data };
}

async function polybuzzGetCuid() {
  return await withRetry(async () => {
    const { data } = await fetchJsonOrThrow(
      "https://api.polybuzz.ai/api/user/getcuid",
      { method: "GET", headers: polybuzzBaseHeaders() },
      "polybuzz getcuid"
    );

    if (!data || typeof data !== "object") throw new Error("polybuzz getcuid: empty response");
    if (data.errNo !== 0) throw new Error(`polybuzz getcuid: ${data.errMsg || "error"} (${data.errNo})`);

    const cuid = data?.data?.cuid;
    if (typeof cuid !== "string" || !cuid.trim()) throw new Error("polybuzz getcuid: missing cuid");
    return cuid.trim();
  });
}

async function polybuzzSceneDetailGuest(secretSceneID, cuid) {
  return await withRetry(async () => {
    const headers = { ...polybuzzBaseHeaders(), cuid, "Content-Type": "application/json" };
    const { data } = await fetchJsonOrThrow(
      "https://api.polybuzz.ai/api/scene/detailguest",
      { method: "POST", headers, body: JSON.stringify({ secretSceneID }) },
      "polybuzz detailguest"
    );

    if (!data || typeof data !== "object") throw new Error("polybuzz detailguest: empty response");
    if (data.errNo !== 0) throw new Error(`polybuzz detailguest: ${data.errMsg || "error"} (${data.errNo})`);
    return data.data && typeof data.data === "object" ? data.data : {};
  });
}

async function polybuzzSceneProfileGuest(secretSceneID, cuid) {
  return await withRetry(async () => {
    const headers = { ...polybuzzBaseHeaders(), cuid };
    const url = `https://api.polybuzz.ai/api/scene/profileguest?secretSceneID=${encodeURIComponent(secretSceneID)}`;
    const { data } = await fetchJsonOrThrow(url, { method: "GET", headers }, "polybuzz profileguest");

    if (!data || typeof data !== "object") throw new Error("polybuzz profileguest: empty response");
    if (data.errNo !== 0) throw new Error(`polybuzz profileguest: ${data.errMsg || "error"} (${data.errNo})`);
    return data.data && typeof data.data === "object" ? data.data : {};
  });
}

function polybuzzGenderToLocal(g) {
  // Observed: 1 = male, 2 = female.
  if (g === 1 || g === "1") return "male";
  if (g === 2 || g === "2") return "female";
  return "unspecified";
}

function parsePolybuzzPageSize(value, fallback = 50) {
  return Math.min(50, Math.max(1, Number(value) || fallback));
}

function extractFirstAssistantLine(speechText, sceneName) {
  const text = String(speechText || "");
  const name = String(sceneName || "").trim();
  if (!text) return "";

  const lines = text.split(/\r?\n/).map((l) => String(l || "").trim()).filter(Boolean);
  const isEllipsis = (s) => s === "..." || s === "…" || /^(\.|…)+$/.test(s);
  const isStage = (s) => s.startsWith("*") && s.endsWith("*") && s.length >= 3;
  const isUserLine = (s) => {
    const low = s.toLowerCase();
    return low.startsWith("guest:") || low.startsWith("user:") || low.startsWith("you:");
  };

  const assistantPrefixes = [];
  if (name) assistantPrefixes.push(name.toLowerCase() + ":");
  assistantPrefixes.push("assistant:", "ai:");

  for (const l of lines) {
    if (isEllipsis(l)) continue;
    const low = l.toLowerCase();
    for (const p of assistantPrefixes) {
      if (low.startsWith(p)) {
        const msg = l.slice(p.length).trim();
        if (msg && !isEllipsis(msg)) return msg;
      }
    }
  }

  for (const l of lines) {
    if (isEllipsis(l) || isStage(l) || isUserLine(l)) continue;
    if (l.includes(":")) {
      const [head, tail] = l.split(":", 2);
      if (head && tail && head.length <= 24 && !isUserLine(head + ":")) return tail.trim();
    }
    return l;
  }

  return "";
}

function extractPolybuzzCharacterFromHtml(html, pageUrl) {
  const titleMeta = extractMetaContent(html, "og:title") || extractMetaContent(html, "twitter:title") || "";
  const descMeta = extractMetaContent(html, "og:description") || extractMetaContent(html, "description") || "";
  const imgMeta = extractMetaContent(html, "og:image") || extractMetaContent(html, "twitter:image") || "";

  const text = htmlToText(html);
  const lines = splitLines(text);

  const stopLabels = new Set(
    [
      "intro",
      "introduction",
      "greeting",
      "first message",
      "dialogue style",
      "dialogue",
      "style",
      "scenario",
      "setting",
      "background",
      "description",
      "tags",
      "интро",
      "приветствие",
      "начальное сообщение",
      "стиль диалога",
      "сцена",
      "обстановка",
      "предыстория",
      "описание",
      "теги"
    ].map(normalizeLine)
  );

  const blocked =
    /you'?ve reached the view limit/i.test(text) ||
    /view limit/i.test(text) ||
    /please log in/i.test(text) ||
    /log in to see more/i.test(text);

  if (blocked) {
    return { error: "Polybuzz просит логин (view limit). Откройте персонажа и экспортируйте JSON/PNG card, либо задайте POLYBUZZ_COOKIE для локального сервера." };
  }

  const name =
    normalizeTitle(titleMeta) ||
    normalizeTitle(extractTagText(html, "title")) ||
    (lines.length > 0 ? normalizeTitle(lines[0]) : "") ||
    "";

  const intro =
    pickSection(lines, ["Intro", "Intro.", "Introduction", "Интро", "Интро."], stopLabels, 12) ||
    descMeta ||
    "";

  const greeting = pickSection(
    lines,
    ["Greeting", "Greeting.", "First message", "First Message", "Приветствие", "Начальное сообщение"],
    stopLabels,
    12
  );

  const dialogueStyle = pickSection(
    lines,
    ["Dialogue Style", "Dialogue Style.", "Style", "Стиль диалога"],
    stopLabels,
    12
  );

  const scenario = pickSection(
    lines,
    ["Scenario", "Scenario.", "Setting", "Setting.", "Сцена", "Обстановка"],
    stopLabels,
    12
  );

  const out = {
    name: name || "Imported",
    gender: "unspecified",
    avatar_url: imgMeta || "",
    cover_url: "",
    intro: intro || "",
    greeting: greeting || "",
    dialogue_style: dialogueStyle || "",
    scenario: scenario || "",
    source_url: String(pageUrl || "")
  };

  return { character: out };
}

app.post("/api/import/polybuzz", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: "url обязателен" });
      return;
    }

    const u = isAllowedPolybuzzUrl(rawUrl);
    if (!u) {
      res.status(400).json({ ok: false, error: "Разрешены только ссылки на polybuzz.ai" });
      return;
    }

    const secretSceneID = extractPolybuzzSecretSceneId(u);
    if (secretSceneID) {
      // Preferred path: PolyBuzz API (works even when HTML shows view-limit/login).
      try {
        const cuid = await polybuzzGetCuid();
        const [detail, profile] = await Promise.all([
          polybuzzSceneDetailGuest(secretSceneID, cuid),
          polybuzzSceneProfileGuest(secretSceneID, cuid).catch(() => ({}))
        ]);

        const sceneName = String(detail.sceneName || profile.sceneName || detail.oriSceneName || profile.oriSceneName || "").trim();
        const sceneBrief = String(profile.sceneBrief || detail.sceneBrief || "").trim();
        const rawAvatarUrl = String(detail.sceneAvatarUrl || profile.sceneAvatarUrl || "").trim();
        const bgUrl = String(detail.conversationBackgroundImg || profile.homeCoverUrl || detail.homeCoverUrl || "").trim();
        const coverUrl = String(profile.homeCoverUrl || detail.homeCoverUrl || "").trim();

        // If the avatar from polybuzz is a ghost/placeholder (served from /polyai/ CDN path),
        // fall back to the cover image which is usually the real character photo.
        const bestAvatarUrl = isPolybuzzGhostUrl(rawAvatarUrl)
          ? (coverUrl || bgUrl || rawAvatarUrl)
          : rawAvatarUrl;

        // Use a non-ghost URL for the background/cover image.
        const bestBgUrl = isPolybuzzGhostUrl(bgUrl) ? "" : bgUrl;

        const tags = Array.isArray(profile.sceneTags) ? profile.sceneTags.map((t) => t && t.tagName).filter(Boolean) : [];
        const tagsText = tags.length ? tags.join(", ") : "";

        const greeting = extractFirstAssistantLine(detail.speechText, sceneName);

        // Download images as base64 data URLs so the character is self-contained
        // (won't break if the CDN goes offline). Falls back to the original URL on error.
        const [avatarData, bgData] = await Promise.all([
          bestAvatarUrl ? downloadImageAsDataUrl(bestAvatarUrl) : Promise.resolve(null),
          bestBgUrl ? downloadImageAsDataUrl(bestBgUrl) : Promise.resolve(null)
        ]);

        res.json({
          ok: true,
          character: {
            name: sceneName || "Imported",
            gender: polybuzzGenderToLocal(profile.sceneGender),
            avatar_url: avatarData || bestAvatarUrl || "",
            background_url: bgData || bestBgUrl || "",
            cover_url: coverUrl,
            backgroundHint: tagsText,
            intro: sceneBrief,
            scenario: sceneBrief,
            greeting,
            // NOTE: detail.systemRole is deliberately excluded — it's polybuzz's own
            // system prompt written from the user's POV ("you are talking to character X")
            // and would invert the AI's role when embedded in our character backstory.
            mes_example: String(detail.speechText || "").trim(),
            source_url: u.toString()
          }
        });
        return;
      } catch (errApi) {
        // Fall back to HTML-based extraction below.
        console.warn("[import polybuzz] API fallback:", String(errApi?.message || errApi));
      }
    }

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru,en;q=0.8",
      "Cache-Control": "no-cache"
    };
    if (POLYBUZZ_COOKIE) headers.Cookie = POLYBUZZ_COOKIE;

    const upstream = await fetch(u.toString(), { method: "GET", headers, redirect: "follow" });
    const html = await upstream.text();

    if (!upstream.ok) {
      res.status(502).json({ ok: false, error: `Polybuzz вернул ${upstream.status}` });
      return;
    }

    if (html.length > 3_000_000) {
      res.status(502).json({ ok: false, error: "Ответ слишком большой (страница Polybuzz)" });
      return;
    }

    const extracted = extractPolybuzzCharacterFromHtml(html, upstream.url || u.toString());
    if (extracted.error) {
      res.status(400).json({ ok: false, error: extracted.error });
      return;
    }

    res.json({ ok: true, character: extracted.character });
  } catch (err) {
    console.error("[import polybuzz]", err);
    res.status(502).json({ ok: false, error: "Не удалось импортировать с Polybuzz", details: String(err) });
  }
});

// ===== PolyBuzz catalog: scrape the main page and extract NUXT payload characters =====

function hasCJK(str) {
  return /[\u2E80-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/.test(str || "");
}

function extractScenesFromPayload(payload) {
  const characters = [];
  for (let i = 0; i < payload.length; i++) {
    const item = payload[i];
    if (!Array.isArray(item)) continue;
    const firstRef = item[0];
    if (typeof firstRef !== "number" || firstRef >= payload.length) continue;
    const firstTpl = payload[firstRef];
    if (!firstTpl || typeof firstTpl !== "object" || Array.isArray(firstTpl)) continue;
    if (!("secretSceneId" in firstTpl) || !("sceneName" in firstTpl)) continue;

    for (const idx of item) {
      if (typeof idx !== "number" || idx >= payload.length) continue;
      const tpl = payload[idx];
      if (!tpl || typeof tpl !== "object" || Array.isArray(tpl) || !("secretSceneId" in tpl)) continue;

      const resolve = (key) => {
        const ref = tpl[key];
        if (ref === undefined || ref === null) return null;
        if (typeof ref === "number" && Number.isInteger(ref) && ref >= 0 && ref < payload.length) {
          return payload[ref];
        }
        return ref;
      };

      const sid = resolve("secretSceneId");
      const name = resolve("sceneName");
      if (!sid || typeof sid !== "string") continue;

      const oriName = resolve("oriSceneName");
      const brief = resolve("brief");
      const totalChat = resolve("totalChatCnt");
      const avatar = resolve("chatbotAvatarUrl");
      const bg = resolve("chatBackgroundImgUrl");
      const cover = resolve("homeCoverUrl");

      const tagsRef = resolve("sceneTags");
      const tags = [];
      if (Array.isArray(tagsRef)) {
        for (const tIdx of tagsRef) {
          const t = typeof tIdx === "number" && tIdx < payload.length ? payload[tIdx] : tIdx;
          if (t && typeof t === "object" && !Array.isArray(t)) {
            const tnRef = t.tagName;
            const tn = typeof tnRef === "number" && tnRef < payload.length ? payload[tnRef] : tnRef;
            if (tn) tags.push(String(tn));
          }
        }
      }

      characters.push({
        secretSceneId: sid,
        name: String(name || ""),
        oriName: String(oriName || ""),
        brief: String(brief || ""),
        totalChats: typeof totalChat === "number" ? totalChat : 0,
        avatar: String(avatar || ""),
        background: String(bg || ""),
        cover: String(cover || ""),
        tags,
        url: `https://www.polybuzz.ai/ru/character/profile/${encodeURIComponent(String(oriName || name || "").toLowerCase().replace(/\s+/g, "-"))}-${sid}`
      });
    }
    break;
  }
  return characters;
}

let polybuzzCatalogCache = { items: [], fetchedAt: 0 };
const POLYBUZZ_CATALOG_TTL = 10 * 60 * 1000; // 10 minutes
const POLYBUZZ_GENDER_TTL = 30 * 60 * 1000; // 30 minutes
const POLYBUZZ_GENDER_FAIL_TTL = 60 * 1000; // Retry temporary failures soon.
const polybuzzGenderCache = new Map(); // secretSceneId -> { gender, status, fetchedAt }
const polybuzzGenderPending = new Map(); // secretSceneId -> Promise<entry>

function normalizePolybuzzGenderEntry(secretSceneId, sceneGender) {
  const gender = polybuzzGenderToLocal(sceneGender);
  return {
    secretSceneId: String(secretSceneId || ""),
    gender,
    status: gender === "male" || gender === "female" ? "resolved" : "unknown",
    fetchedAt: Date.now()
  };
}

function getCachedPolybuzzGender(secretSceneId) {
  const id = String(secretSceneId || "").trim();
  if (!id) return null;

  const entry = polybuzzGenderCache.get(id);
  if (!entry) return null;

  const age = Date.now() - (Number(entry.fetchedAt) || 0);
  const ttl = entry.status === "failed" ? POLYBUZZ_GENDER_FAIL_TTL : POLYBUZZ_GENDER_TTL;
  if (age > ttl) {
    polybuzzGenderCache.delete(id);
    return null;
  }

  return entry;
}

function applyPolybuzzGenderCache(item) {
  if (!item || typeof item !== "object") return item;
  const cached = getCachedPolybuzzGender(item.secretSceneId);
  if (!cached) return item;

  return {
    ...item,
    gender: cached.gender,
    genderStatus: cached.status
  };
}

function applyPolybuzzGenderCacheToItems(items) {
  return (Array.isArray(items) ? items : []).map(applyPolybuzzGenderCache);
}

function uniquePolybuzzSceneIds(ids) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function resolvePolybuzzGender(secretSceneId, cuid) {
  const id = String(secretSceneId || "").trim();
  if (!id) return null;

  const cached = getCachedPolybuzzGender(id);
  if (cached) return cached;

  if (polybuzzGenderPending.has(id)) return await polybuzzGenderPending.get(id);

  const task = (async () => {
    try {
      const profile = await polybuzzSceneProfileGuest(id, cuid);
      const entry = normalizePolybuzzGenderEntry(id, profile.sceneGender);
      polybuzzGenderCache.set(id, entry);
      return entry;
    } catch (err) {
      const entry = {
        secretSceneId: id,
        gender: undefined,
        status: "failed",
        fetchedAt: Date.now()
      };
      polybuzzGenderCache.set(id, entry);
      return entry;
    } finally {
      polybuzzGenderPending.delete(id);
    }
  })();

  polybuzzGenderPending.set(id, task);
  return await task;
}

async function resolvePolybuzzGenders(ids, { concurrency = 6 } = {}) {
  const sceneIds = uniquePolybuzzSceneIds(ids);
  if (!sceneIds.length) return [];

  const cuid = await polybuzzGetCuid();
  const limit = Math.min(12, Math.max(1, Number(concurrency) || 6));
  const out = [];

  for (let i = 0; i < sceneIds.length; i += limit) {
    const batch = sceneIds.slice(i, i + limit);
    const entries = await Promise.all(batch.map((id) => resolvePolybuzzGender(id, cuid)));
    out.push(...entries.filter(Boolean));
  }

  return out;
}

function startPolybuzzGenderEnrichment(items, { concurrency = 6 } = {}) {
  const ids = (Array.isArray(items) ? items : [])
    .map((item) => item && item.secretSceneId)
    .filter((id) => id && !getCachedPolybuzzGender(id));
  if (!ids.length) return;

  resolvePolybuzzGenders(ids, { concurrency }).catch((e) => {
    console.warn("[polybuzz gender enrich]", e);
  });
}

async function scrapePolybuzzCatalog() {
  const now = Date.now();
  if (polybuzzCatalogCache.items.length > 0 && now - polybuzzCatalogCache.fetchedAt < POLYBUZZ_CATALOG_TTL) {
    return applyPolybuzzGenderCacheToItems(polybuzzCatalogCache.items);
  }

  const headers = {
    ...polybuzzBaseHeaders({ accept: "text/html,application/xhtml+xml" }),
    "Cache-Control": "no-cache"
  };

  const upstream = await fetch("https://www.polybuzz.ai/ru", { method: "GET", headers, redirect: "follow" });
  if (!upstream.ok) throw new Error(`Polybuzz returned ${upstream.status}`);
  const html = await upstream.text();

  // Extract Nuxt 3 payload: the <script> tag containing ShallowReactive + scene data
  const scriptMatch = html.match(/<script[^>]*>((?:\[.*?ShallowReactive.*?))<\/script>/s);
  if (!scriptMatch) throw new Error("Не удалось найти данные на странице Polybuzz");

  let payload;
  try {
    payload = JSON.parse(scriptMatch[1]);
  } catch {
    throw new Error("Не удалось распарсить данные Polybuzz");
  }

  if (!Array.isArray(payload)) throw new Error("Неверный формат данных Polybuzz");

  const characters = extractScenesFromPayload(payload).filter((c) => !hasCJK(c.name));

  polybuzzCatalogCache = { items: characters, fetchedAt: now };

  // Fire-and-forget gender enrichment (don't block the first response)
  startPolybuzzGenderEnrichment(characters);

  return applyPolybuzzGenderCacheToItems(characters);
}

async function enrichCatalogGenders(items) {
  if (!items.length) return;
  try {
    const entries = await resolvePolybuzzGenders(
      items.map((item) => item && item.secretSceneId),
      { concurrency: 6 }
    );
    const byId = new Map(entries.map((entry) => [entry.secretSceneId, entry]));
    for (const item of items) {
      const entry = item && byId.get(item.secretSceneId);
      if (!entry) continue;
      item.gender = entry.gender;
      item.genderStatus = entry.status;
    }
  } catch (e) {
    console.warn("[enrichCatalogGenders]", e);
  }
}

function mapPolybuzzSceneToItem(s) {
  return {
    secretSceneId: String(s.secretSceneId || ""),
    name: String(s.sceneName || ""),
    oriName: String(s.oriSceneName || ""),
    brief: String(s.brief || ""),
    totalChats: Number(s.totalChatCnt) || 0,
    avatar: String(s.chatbotAvatarUrl || ""),
    background: String(s.chatBackgroundImgUrl || ""),
    cover: String(s.homeCoverUrl || ""),
    tags: Array.isArray(s.sceneTags) ? s.sceneTags.map((t) => t?.tagName).filter(Boolean) : [],
    url: `https://www.polybuzz.ai/ru/character/profile/${encodeURIComponent(String(s.oriSceneName || s.sceneName || "").toLowerCase().replace(/\s+/g, "-"))}-${s.secretSceneId}`
  };
}

// Scrape additional locale pages to get more characters beyond the /ru page.
// Each locale may surface different characters in its Nuxt payload.
const POLYBUZZ_LOCALE_PAGES = ["/ru", "/en", "/pt", "/de", "/fr", "/es"];
const polybuzzPageCache = new Map(); // page -> { items, fetchedAt }

async function fetchPolybuzzCatalogPage(page) {
  // Return cached items if available (so gender enrichment persists)
  const cached = polybuzzPageCache.get(page);
  if (cached && Date.now() - cached.fetchedAt < POLYBUZZ_CATALOG_TTL) {
    return applyPolybuzzGenderCacheToItems(cached.items);
  }

  const localeIdx = page - 1;
  if (localeIdx >= POLYBUZZ_LOCALE_PAGES.length) return [];

  const locale = POLYBUZZ_LOCALE_PAGES[localeIdx];
  const headers = {
    ...polybuzzBaseHeaders({ accept: "text/html,application/xhtml+xml" }),
    "Cache-Control": "no-cache"
  };

  try {
    const upstream = await fetch(`https://www.polybuzz.ai${locale}`, { method: "GET", headers, redirect: "follow" });
    if (!upstream.ok) return [];
    const html = await upstream.text();

    const scriptMatch = html.match(/<script[^>]*>((?:\[.*?ShallowReactive.*?))<\/script>/s);
    if (!scriptMatch) return [];

    let payload;
    try { payload = JSON.parse(scriptMatch[1]); } catch { return []; }
    if (!Array.isArray(payload)) return [];

    const items = extractScenesFromPayload(payload).filter((c) => !hasCJK(c.name));
    polybuzzPageCache.set(page, { items, fetchedAt: Date.now() });
    return applyPolybuzzGenderCacheToItems(items);
  } catch {
    return [];
  }
}

// Browse more characters via the search API after locale pages are exhausted.
// Rotates through broad single-letter queries to get diverse results.
const POLYBUZZ_BROWSE_SEEDS = "eaisontrlcdupmhgbfywkvxzjq".split("");
const POLYBUZZ_BROWSE_PAGES_PER_SEED = 10; // 10 search pages per seed letter
const polybuzzBrowseCache = new Map(); // "letter:page" -> { items, fetchedAt }

async function fetchPolybuzzCatalogViaSearch(browsePage, pageSize = 50) {
  const seedIdx = Math.floor((browsePage - 1) / POLYBUZZ_BROWSE_PAGES_PER_SEED);
  const searchPage = ((browsePage - 1) % POLYBUZZ_BROWSE_PAGES_PER_SEED) + 1;

  if (seedIdx >= POLYBUZZ_BROWSE_SEEDS.length) return { items: [], hasMore: false };

  const query = POLYBUZZ_BROWSE_SEEDS[seedIdx];
  const size = parsePolybuzzPageSize(pageSize);
  const cacheKey = `${query}:${searchPage}:${size}`;
  const cached = polybuzzBrowseCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < POLYBUZZ_CATALOG_TTL) {
    return { items: applyPolybuzzGenderCacheToItems(cached.items), hasMore: cached.hasMore };
  }

  const cuid = await polybuzzGetCuid();
  const headers = { ...polybuzzBaseHeaders(), cuid, "Content-Type": "application/json" };

  const result = await fetchJsonOrThrow(
    "https://api.polybuzz.ai/api/scene/search",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query, pageNo: searchPage, pageSize: size })
    },
    "polybuzz catalog-browse"
  );

  const respBody = result.data;
  if (!respBody || respBody.errNo !== 0) throw new Error(respBody?.errMsg || "catalog browse error");

  const list = Array.isArray(respBody.data?.list) ? respBody.data.list : [];
  const items = list.map(mapPolybuzzSceneToItem).filter((c) => !hasCJK(c.name));
  // hasMore if this seed still has results, or there are more seeds to try
  const seedHasMore = list.length >= size;
  const moreSeedsAvail = seedIdx < POLYBUZZ_BROWSE_SEEDS.length - 1;
  const hasMore = seedHasMore || moreSeedsAvail;

  polybuzzBrowseCache.set(cacheKey, { items, hasMore, fetchedAt: Date.now() });
  return { items: applyPolybuzzGenderCacheToItems(items), hasMore };
}

app.get("/api/polybuzz/catalog", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = parsePolybuzzPageSize(req.query.pageSize, 50);
    const sendItems = (rawItems, hasMore) => {
      const items = applyPolybuzzGenderCacheToItems(rawItems).slice(0, pageSize);
      startPolybuzzGenderEnrichment(items);
      res.json({ ok: true, items, hasMore });
    };
    if (page === 1) {
      // First page: use scraped HTML catalog (richer data)
      const items = await scrapePolybuzzCatalog();
      sendItems(items, true);
    } else if (page <= POLYBUZZ_LOCALE_PAGES.length) {
      // Locale pages 2-6: scrape other locale versions
      const items = await fetchPolybuzzCatalogPage(page);
      // Always hasMore — search API continues after locales
      sendItems(items, true);
    } else {
      // Pages beyond locales: browse via search API
      const browsePage = page - POLYBUZZ_LOCALE_PAGES.length;
      const { items, hasMore } = await fetchPolybuzzCatalogViaSearch(browsePage, pageSize);
      sendItems(items, hasMore);
    }
  } catch (err) {
    console.error("[polybuzz catalog]", err);
    res.status(502).json({ ok: false, error: String(err?.message || err), items: [], hasMore: false });
  }
});

app.post("/api/polybuzz/genders", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const ids = uniquePolybuzzSceneIds(body.ids).slice(0, 100);
    const shouldResolve = body.resolve === true;

    if (shouldResolve) {
      await resolvePolybuzzGenders(ids, { concurrency: 8 });
    }

    const genders = ids.map((id) => {
      const cached = getCachedPolybuzzGender(id);
      if (!cached) {
        return {
          secretSceneId: id,
          status: polybuzzGenderPending.has(id) ? "pending" : "missing"
        };
      }

      return {
        secretSceneId: id,
        gender: cached.gender,
        status: cached.status
      };
    });

    res.json({ ok: true, genders });
  } catch (err) {
    console.error("[polybuzz genders]", err);
    res.status(502).json({ ok: false, error: String(err?.message || err), genders: [] });
  }
});

app.post("/api/polybuzz/search", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const query = String(body.query || "").trim();
    const page = Math.max(1, Number(body.page) || 1);
    const pageSize = parsePolybuzzPageSize(body.pageSize, 50);

    if (!query) {
      res.status(400).json({ ok: false, error: "query обязателен", items: [] });
      return;
    }

    const cuid = await polybuzzGetCuid();
    const headers = { ...polybuzzBaseHeaders(), cuid, "Content-Type": "application/json" };

    const result = await fetchJsonOrThrow(
      "https://api.polybuzz.ai/api/scene/search",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query, pageNo: page, pageSize })
      },
      "polybuzz search"
    );

    const respBody = result.data;
    if (!respBody || respBody.errNo !== 0) {
      throw new Error(respBody?.errMsg || "search error");
    }

    const list = Array.isArray(respBody.data?.list) ? respBody.data.list : [];
    const items = applyPolybuzzGenderCacheToItems(list.map(mapPolybuzzSceneToItem).filter((c) => !hasCJK(c.name)));
    const hasMore = list.length >= pageSize;
    startPolybuzzGenderEnrichment(items);

    res.json({ ok: true, items, hasMore });
  } catch (err) {
    console.error("[polybuzz search]", err);
    res.status(502).json({ ok: false, error: String(err?.message || err), items: [] });
  }
});

// Detect polybuzz ghost/placeholder avatar URLs (served from /polyai/ CDN path).
// Real character photos come from paths like /speakmaster/.
function isPolybuzzGhostUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(String(url).trim());
    if (u.pathname.startsWith("/polyai/")) return true;
  } catch {}
  return false;
}

// Download an image URL and return a base64 data URL for self-contained storage.
// Returns null on any error or if the image exceeds maxBytes.
async function downloadImageAsDataUrl(imgUrl, maxBytes = 2 * 1024 * 1024) {
  if (!imgUrl) return null;
  try {
    const headers = polybuzzBaseHeaders({ accept: "image/*,*/*;q=0.8" });
    const resp = await fetch(String(imgUrl), { method: "GET", headers, redirect: "follow" });
    if (!resp.ok) return null;

    const contentLength = Number(resp.headers.get("content-length") || 0);
    if (contentLength > maxBytes) return null;

    const buf = await resp.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;

    const mimeType = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim() || "image/jpeg";
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

function isAllowedMediaUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || "").trim());
    if (!(u.protocol === "https:" || u.protocol === "http:")) return null;
    const host = u.hostname.toLowerCase();
    if (
      host === "polybuzz.ai" ||
      host.endsWith(".polybuzz.ai") ||
      host === "polyspeak.ai" ||
      host.endsWith(".polyspeak.ai")
    ) {
      return u;
    }
    return null;
  } catch {
    return null;
  }
}

app.get("/api/media", async (req, res) => {
  try {
    const u = isAllowedMediaUrl(req.query?.url);
    if (!u) {
      res.status(400).json({ error: "Unsupported media URL" });
      return;
    }

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "ru,en;q=0.8",
      Referer: "https://www.polybuzz.ai/",
      Origin: "https://www.polybuzz.ai"
    };
    if (POLYBUZZ_COOKIE) headers.Cookie = POLYBUZZ_COOKIE;

    const upstream = await fetch(u.toString(), { method: "GET", headers, redirect: "follow" });
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: `Upstream media error: ${upstream.status}` });
      return;
    }

    const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) {
      res.status(415).json({ error: "Unsupported media type" });
      return;
    }

    if (contentType) res.setHeader("Content-Type", contentType);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    res.setHeader("Cache-Control", "public, max-age=21600");

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error("[media proxy]", err);
    res.status(502).json({ error: "Failed to proxy media" });
  }
});

// ===== Shared characters storage =====

const DATA_DIR = path.join(__dirname, "data");
const CHARACTERS_FILE = path.join(DATA_DIR, "characters.json");
const CHARACTERS_BACKUP_PREFIX = "characters.pre-migration";

const CORE_CHARACTER_KEYS = new Set([
  "id",
  "name",
  "gender",
  "intro",
  "backstory",
  "initialMessage",
  "avatar",
  "background",
  "createdAt",
  "updatedAt",
  "schemaVersion",
  "legacy"
]);

const LEGACY_CHARACTER_KEYS = [
  "visibility",
  "tags",
  "backgroundHint",
  "outfit",
  "setting",
  "dialogueStyle"
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item).trim()).filter(Boolean);
}

function appendLegacySection(base, label, value) {
  const text = normalizeString(value).trim();
  if (!text) return base;

  const prefix = `${label}:`;
  if (base.includes(prefix) && base.includes(text)) return base;
  return base ? `${base}\n\n${prefix} ${text}` : `${prefix} ${text}`;
}

function buildMergedBackstory(raw) {
  let text = normalizeString(raw.backstory).trim();
  text = appendLegacySection(text, "Обстановка", raw.setting);
  text = appendLegacySection(text, "Подсказка фона", raw.backgroundHint);
  text = appendLegacySection(text, "Внешность", raw.outfit);

  const dialogueStyle = normalizeString(raw.dialogueStyle).trim();
  if (dialogueStyle) text = appendLegacySection(text, "Стиль диалога", dialogueStyle);

  const tags = normalizeStringArray(raw.tags);
  if (tags.length) text = appendLegacySection(text, "Теги", tags.join(", "));

  return text;
}

function collectLegacyFields(raw) {
  const existingLegacy = isPlainObject(raw.legacy) ? raw.legacy : {};
  const legacy = { ...existingLegacy };

  for (const key of LEGACY_CHARACTER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    if (key === "tags") legacy[key] = normalizeStringArray(raw[key]);
    else legacy[key] = raw[key];
  }

  for (const [key, value] of Object.entries(raw)) {
    if (CORE_CHARACTER_KEYS.has(key) || LEGACY_CHARACTER_KEYS.includes(key)) continue;
    legacy[key] = value;
  }

  return legacy;
}

function migrateCharacterRecord(raw) {
  if (!isPlainObject(raw) || !raw.id) return null;

  const migrated = {
    id: normalizeString(raw.id),
    name: normalizeString(raw.name).trim(),
    gender: normalizeString(raw.gender).trim() || "unspecified",
    intro: normalizeString(raw.intro).trim(),
    backstory: buildMergedBackstory(raw),
    initialMessage: normalizeString(raw.initialMessage).trim(),
    avatar: normalizeString(raw.avatar).trim(),
    background: normalizeString(raw.background).trim(),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now(),
    schemaVersion: 2,
    legacy: collectLegacyFields(raw)
  };

  migrated.visibility = normalizeString(raw.visibility).trim() || "public";
  migrated.tags = normalizeStringArray(raw.tags);
  migrated.backgroundHint = normalizeString(raw.backgroundHint).trim();
  migrated.outfit = normalizeString(raw.outfit).trim();
  migrated.setting = normalizeString(raw.setting).trim();
  migrated.dialogueStyle = normalizeString(raw.dialogueStyle).trim() || "natural";

  if (!migrated.intro) {
    migrated.intro = normalizeString(raw.setting || raw.backgroundHint || raw.backstory).trim().slice(0, 400);
  }

  return migrated;
}

function backupCharactersFileOnce(rawText) {
  ensureDataDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(DATA_DIR, `${CHARACTERS_BACKUP_PREFIX}.${stamp}.json`);
  fs.writeFileSync(backupFile, rawText, "utf8");
  return backupFile;
}

function loadCharacters() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(CHARACTERS_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];

    const migrated = arr.map(migrateCharacterRecord).filter(Boolean);
    const changed = JSON.stringify(arr) !== JSON.stringify(migrated);
    if (changed) {
      const backupFile = backupCharactersFileOnce(raw);
      saveCharactersFile(migrated);
      console.log(`[characters] migrated storage to schema v2, backup: ${backupFile}`);
    }

    return migrated;
  } catch {
    return [];
  }
}

function saveCharactersFile(arr) {
  ensureDataDir();
  fs.writeFileSync(CHARACTERS_FILE, JSON.stringify(arr, null, 2), "utf8");
}

// GET all characters
app.get("/api/characters", (_req, res) => {
  res.json(loadCharacters());
});

// POST upsert a character
app.post("/api/characters", (req, res) => {
  const ch = migrateCharacterRecord(req.body);
  if (!ch) {
    return res.status(400).json({ error: "Character must have an id" });
  }
  const chars = loadCharacters();
  const idx = chars.findIndex((c) => c.id === ch.id);
  if (idx === -1) chars.unshift(ch);
  else chars[idx] = ch;
  saveCharactersFile(chars);
  res.json({ ok: true });
});

// POST bulk upsert (for migration / import)
app.post("/api/characters/bulk", (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "Expected array" });
  }
  const chars = loadCharacters();
  const existingIds = new Set(chars.map((c) => c.id));
  for (const ch of items) {
    const migrated = migrateCharacterRecord(ch);
    if (!migrated) continue;
    if (existingIds.has(migrated.id)) {
      const idx = chars.findIndex((c) => c.id === migrated.id);
      if (idx !== -1) chars[idx] = migrated;
    } else {
      chars.push(migrated);
      existingIds.add(migrated.id);
    }
  }
  saveCharactersFile(chars);
  res.json({ ok: true, count: chars.length });
});

// DELETE a character by id
app.delete("/api/characters/:id", (req, res) => {
  const id = req.params.id;
  let chars = loadCharacters();
  const before = chars.length;
  chars = chars.filter((c) => c.id !== id);
  saveCharactersFile(chars);
  res.json({ ok: true, deleted: chars.length < before });
});

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

function startServer() {
  const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Web UI: http://localhost:${PORT}`);
  const nets = require("os").networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) {
        console.log(`  LAN:  http://${iface.address}:${PORT}`);
      }
    }
  }
  console.log(`LM Studio base: ${LMSTUDIO_BASE_URL}`);
});

  server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. If the app is already running, open http://localhost:${PORT}`);
    process.exit(1);
  }

    console.error("Failed to start server:", err);
    process.exit(1);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  stripSlashes,
  deriveRestBaseUrl,
  deriveOpenAiBaseUrl
};
