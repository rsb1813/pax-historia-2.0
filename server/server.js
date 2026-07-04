/*! Open Historia — portions (CORS, AI relay, shutdown endpoint, hub proxy) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import express from "express";
import fs from "fs";
import https from "https";
import path from "path";
import url from "url";
import { revealKey } from "./aiKeys.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { ensureGameStore, ensureScenarioStore } from "./libraryStore.js";
import { ensureMapEditorStore } from "./mapEditorStore.js";
import accountRouter from "./routes/account.js";
import authRouter from "./routes/auth.js";
import libraryRouter from "./routes/library.js";
import mapeditorRouter from "./routes/mapeditor.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const distDir = path.join(__dirname, "../dist");

const jsonParser = express.json({ limit: "64mb" });
const largeJsonParser = express.json({ limit: "2048mb" });

// The Android app's connect screen lives on the WebView's own origin, so its
// probe of this server is a cross-origin request — without these headers the
// phone blocks it (CORS) and the app can never connect. Now that the rest of
// the API sits behind session cookies (which "Access-Control-Allow-Origin: *"
// cannot legally carry), the blanket allow is scoped to just this public,
// unauthenticated probe endpoint instead of the whole app.
const setHealthCorsHeaders = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Chrome's Private Network Access preflights loopback/LAN targets and
  // requires this opt-in on top of regular CORS.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
};

app.get("/api/health", (_req, res) => {
  setHealthCorsHeaders(res);
  res.json({ ok: true });
});

// Chrome's Private Network Access sends an OPTIONS preflight (even for plain
// GET) before the actual request above. Without a matching route here, that
// preflight falls through to the library router's requireAuth and gets a 401
// with no CORS headers, so the browser blocks the real GET — defeating the
// whole point of the health endpoint.
app.options("/api/health", (_req, res) => {
  setHealthCorsHeaders(res);
  res.status(204).end();
});

ensureScenarioStore();
ensureGameStore();
ensureMapEditorStore();

app.use("/api/auth", authRouter);
app.use("/api/account", accountRouter);

const sendError = (res, statusCode, error) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(statusCode).json({ error: message });
};

// Global client preferences (currently the UI language) shared by every
// device that plays through this server — the phone app and desktop browser
// see the same choice, instead of each browser keeping its own.
const uiSettingsFile = path.join(__dirname, "data", "ui-settings.json");

const readUiSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(uiSettingsFile, "utf8"));
  } catch {
    return {};
  }
};

app.get("/api/ui-settings", (_req, res) => {
  res.json(readUiSettings());
});

// Language packs. Two layers merge:
//  - shipped packs (public/lang/<code>.json, arrive with updates) seed the
//    top languages so common strings never need an AI call;
//  - saved packs (server/data/lang/<code>.json) accumulate every translation
//    generated at runtime. They live under server/data, which the update
//    script never touches, so they survive updates. Saved entries win.
const shippedLangDir = fs.existsSync(path.join(distDir, "lang"))
  ? path.join(distDir, "lang")
  : path.join(__dirname, "../public/lang");
const savedLangDir = path.join(__dirname, "data", "lang");

const readLangPack = (dir, code) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const isLangCode = (code) => /^[a-z]{2,3}$/.test(code);

app.get("/api/lang/:code", (req, res) => {
  const code = String(req.params.code || "").toLowerCase();
  if (!isLangCode(code)) {
    return sendError(res, 400, "Invalid language code.");
  }
  res.json({ ...readLangPack(shippedLangDir, code), ...readLangPack(savedLangDir, code) });
});

app.put("/api/lang/:code", largeJsonParser, (req, res) => {
  try {
    const code = String(req.params.code || "").toLowerCase();
    if (!isLangCode(code)) {
      return sendError(res, 400, "Invalid language code.");
    }
    const entries = req.body?.entries;
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
      return sendError(res, 400, "Body must be { entries: { source: translation } }.");
    }
    const saved = readLangPack(savedLangDir, code);
    let added = 0;
    for (const [source, translated] of Object.entries(entries)) {
      if (typeof source === "string" && typeof translated === "string" &&
          source.length <= 3000 && translated.length <= 6000) {
        if (saved[source] !== translated) {
          saved[source] = translated;
          added += 1;
        }
      }
    }
    if (added > 0) {
      fs.mkdirSync(savedLangDir, { recursive: true });
      fs.writeFileSync(path.join(savedLangDir, `${code}.json`), JSON.stringify(saved));
    }
    res.json({ saved: added, total: Object.keys(saved).length });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.put("/api/ui-settings", jsonParser, (req, res) => {
  try {
    const next = { ...readUiSettings() };
    if (typeof req.body?.language === "string" && req.body.language.trim().length <= 16) {
      next.language = req.body.language.trim();
    }
    fs.mkdirSync(path.dirname(uiSettingsFile), { recursive: true });
    fs.writeFileSync(uiSettingsFile, JSON.stringify(next, null, 2));
    res.json(next);
  } catch (error) {
    sendError(res, 500, error);
  }
});

// ---- Scenario Hub --------------------------------------------------------
// Downloads a scenario bundle from the community hub on the browser's behalf —
// GitHub file attachments don't send CORS headers, so the client can't fetch
// them directly. Locked to GitHub hosts; nothing else is proxied.
const HUB_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "user-images.githubusercontent.com",
  "user-attachments.githubusercontent.com",
]);
const HUB_MAX_BUNDLE_BYTES = 200 * 1024 * 1024;

// Browser AI calls to self-hosted OpenAI-compatible endpoints (llama.cpp,
// LM Studio, NVIDIA NIM...) die on CORS — those servers rarely send the
// headers. The game server relays them instead: same-origin for the browser,
// plain server-to-server for the endpoint. The target is whatever the player
// configured in Settings — them talking to their own AI through their own
// game server.
//
// When the client identifies the call as one of its own account-linked
// providers (authProvider), the server looks up that provider's encrypted
// key itself and injects the auth header — the plaintext key never has to
// pass through (or be stored in) the browser for these relayed providers.
// Any client-supplied Authorization/x-api-key header is discarded first so
// it can't be used to smuggle a different credential through.
const RELAY_AUTH_PROVIDERS = ["openai", "openai-compatible", "anthropic"];

app.post("/api/ai/relay", requireAuth, largeJsonParser, async (req, res) => {
  try {
    const { url: targetUrl, method = "POST", headers = {}, payload, authProvider } = req.body ?? {};
    const target = new URL(String(targetUrl ?? ""));
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return sendError(res, 400, new Error("Only http(s) AI endpoints can be relayed."));
    }

    const forwardHeaders = { "Content-Type": "application/json", ...headers };

    if (authProvider) {
      if (!RELAY_AUTH_PROVIDERS.includes(authProvider)) {
        return sendError(res, 400, new Error(`Unknown authProvider: ${authProvider}`));
      }
      // api.openai.com.evil.com is a different host — only the exact host
      // may receive the OpenAI key.
      if (authProvider === "openai" && target.hostname !== "api.openai.com") {
        return sendError(res, 400, new Error('authProvider "openai" may only target api.openai.com.'));
      }

      const key = revealKey(req.user.id, authProvider);
      if (!key) {
        return sendError(res, 400, new Error(`No API key saved for provider: ${authProvider}`));
      }

      for (const name of Object.keys(forwardHeaders)) {
        if (name.toLowerCase() === "authorization" || name.toLowerCase() === "x-api-key") {
          delete forwardHeaders[name];
        }
      }

      if (authProvider === "anthropic") {
        forwardHeaders["x-api-key"] = key;
      } else {
        forwardHeaders.Authorization = `Bearer ${key}`;
      }
    }

    const upstream = await fetch(target, {
      method: method === "GET" ? "GET" : "POST",
      headers: forwardHeaders,
      body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.type(upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (error) {
    sendError(res, 502, error);
  }
});

// Shut the server down from the UI (the ⏻ button in the top bar) — handy on
// phones/Termux and headless installs where no terminal is in sight. Responds
// first so the client can show its "server stopped" screen, then exits.
app.post("/api/server/shutdown", requireAuth, (_req, res) => {
  res.json({ ok: true });
  console.log("Shutdown requested from the UI — exiting.");
  setTimeout(() => process.exit(0), 300);
});

app.get("/api/hub/file", async (req, res) => {
  try {
    const target = new URL(String(req.query.url ?? ""));
    if (target.protocol !== "https:" || !HUB_DOWNLOAD_HOSTS.has(target.hostname)) {
      return sendError(res, 400, new Error("Only GitHub-hosted scenario files can be fetched."));
    }

    const upstream = await fetch(target, { redirect: "follow" });
    if (!upstream.ok) {
      return sendError(res, 502, new Error(`Hub file fetch failed (HTTP ${upstream.status}).`));
    }

    const text = await upstream.text();
    if (text.length > HUB_MAX_BUNDLE_BYTES) {
      return sendError(res, 413, new Error("Scenario bundle is too large."));
    }

    res.setHeader("Cache-Control", "no-store");
    res.type("application/json");
    res.send(text);
  } catch (error) {
    sendError(res, 502, error);
  }
});

// Scenario/game library CRUD + runtime asset routes (routes/library.js) and
// map editor document CRUD (routes/mapeditor.js) — both require auth and
// filter by ownerId/shared internally via an unscoped `router.use(requireAuth)`.
// Their routes hard-code full "/api/..." paths, so they must be mounted at
// "/" — but mounted unguarded, that blanket requireAuth would intercept
// *every* request reaching this point, including the SPA shell and its
// static assets below, and 401 them before they ever render a login screen.
// Every other route this server exposes is registered above and already
// resolves the request before falling through, so by now the only remaining
// candidates are genuine unmatched /api/* calls (must go through requireAuth)
// or SPA/static paths (must not) — gate explicitly on that instead of
// relying on registration order alone.
const requireApiPrefix = (router) => (req, res, next) =>
  req.path.startsWith("/api/") ? router(req, res, next) : next();

app.use(requireApiPrefix(libraryRouter));
app.use(requireApiPrefix(mapeditorRouter));

app.use(express.static(distDir));

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

// A LAN address (e.g. http://192.168.1.20:3000) is not a secure context, so
// service workers — and with them, PWA install — never work on it, only on
// localhost. If `node scripts/generate-dev-cert.mjs` has been run, its cert
// is picked up here so other devices on the network can install the app too
// (each device must first be told to trust the cert once — see that script).
const certKeyPath = path.join(__dirname, "../certs/dev-key.pem");
const certPath = path.join(__dirname, "../certs/dev-cert.pem");
const hasDevCert = fs.existsSync(certKeyPath) && fs.existsSync(certPath);

let httpServer;
if (hasDevCert) {
  try {
    const options = { key: fs.readFileSync(certKeyPath), cert: fs.readFileSync(certPath) };
    httpServer = https.createServer(options, app).listen(PORT, () => {
      console.log(`Server running at https://localhost:${PORT} (dev cert active) — this port is HTTPS-only now, so use https:// everywhere, including localhost.`);
    });
  } catch (error) {
    console.error(`Dev cert at certs/ is unreadable or malformed (${error.message}) — falling back to plain HTTP. Re-run \`node scripts/generate-dev-cert.mjs\`.`);
  }
}
if (!httpServer) {
  httpServer = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// A taken port used to crash with a raw EADDRINUSE stack, which the launchers
// then reported as a bare "Server stopped." — say what actually happened.
httpServer.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use — Open Historia is probably already running.`);
    console.error("Close the other instance (the ⏻ button in the game stops it), or set the");
    console.error(`PORT environment variable to run this one on a different port.`);
    process.exit(1);
  }
  throw error;
});
