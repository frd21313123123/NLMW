/* eslint-disable no-console */

const path = require("path");
const http = require("http");
const https = require("https");
const express = require("express");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const LMSTUDIO_BASE_URL = String(process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1").replace(/\/+$/, "");
const LMSTUDIO_API_KEY = process.env.LMSTUDIO_API_KEY ? String(process.env.LMSTUDIO_API_KEY) : "";

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

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Web UI: http://localhost:${PORT}`);
  console.log(`LM Studio base: ${LMSTUDIO_BASE_URL}`);
});
