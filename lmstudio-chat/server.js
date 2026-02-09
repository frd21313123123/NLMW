/* eslint-disable no-console */

const path = require("path");
const http = require("http");
const https = require("https");
const express = require("express");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const LMSTUDIO_BASE_URL = String(process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1").replace(/\/+$/, "");
const LMSTUDIO_API_KEY = process.env.LMSTUDIO_API_KEY ? String(process.env.LMSTUDIO_API_KEY) : "";
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

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    lmstudioBaseUrl: LMSTUDIO_BASE_URL,
    lmstudioRestBaseUrl: LMSTUDIO_REST_BASE_URL,
    lmstudioOpenAiBaseUrl: LMSTUDIO_OPENAI_BASE_URL
  });
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
        const avatarUrl = String(detail.sceneAvatarUrl || profile.sceneAvatarUrl || "").trim();
        const bgUrl = String(detail.conversationBackgroundImg || profile.homeCoverUrl || detail.homeCoverUrl || "").trim();
        const coverUrl = String(profile.homeCoverUrl || detail.homeCoverUrl || "").trim();

        const tags = Array.isArray(profile.sceneTags) ? profile.sceneTags.map((t) => t && t.tagName).filter(Boolean) : [];
        const tagsText = tags.length ? tags.join(", ") : "";

        const greeting = extractFirstAssistantLine(detail.speechText, sceneName);

        res.json({
          ok: true,
          character: {
            name: sceneName || "Imported",
            gender: polybuzzGenderToLocal(profile.sceneGender),
            avatar_url: avatarUrl,
            background_url: bgUrl,
            cover_url: coverUrl,
            backgroundHint: tagsText,
            intro: sceneBrief,
            scenario: sceneBrief,
            greeting,
            background: String(detail.systemRole || "").trim(),
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

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Web UI: http://localhost:${PORT}`);
  console.log(`LM Studio base: ${LMSTUDIO_BASE_URL}`);
});
