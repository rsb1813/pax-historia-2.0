// 시나리오/게임 라이브러리 + 런타임 자산 CRUD를 계정별 소유권 검증과 함께 제공하는
// Express 라우터 — libraryStore.js의 리팩터된(userId 필수) 함수를 감싼다.
// 아직 server.js에 마운트되지 않았고, server.js의 기존 인라인 라우트도 그대로
// 남아 있다(다음 단계에서 한 번에 교체 예정 — 그 전까지는 앱이 계속 돌아가야 하므로).
import express from "express";
import fs from "fs";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createGame,
  createScenario,
  deleteGame,
  deleteScenario,
  exportScenarioBundle,
  getGameCatalog,
  getGameDetails,
  getLibraryCatalog,
  getScenarioCatalog,
  getScenarioDetails,
  importScenarioBundle,
  readRuntimeJsonAsset,
  removeGameAsset,
  removeScenarioAsset,
  resolveGameUploadAsset,
  resolveScenarioUploadAsset,
  resolveRuntimeBinaryAsset,
  setActiveGame,
  setSelectedScenario,
  updateGame,
  updateScenario,
  uploadGameAsset,
  uploadScenarioAsset,
  writeRuntimeJsonAsset,
} from "../libraryStore.js";

const router = express.Router();

const jsonParser = express.json({ limit: "64mb" });
const largeJsonParser = express.json({ limit: "2048mb" });
const uploadParser = express.raw({ type: () => true, limit: "2048mb" });

const sendError = (res, statusCode, error) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(statusCode).json({ error: message });
};

const streamBinaryFile = (req, res, sourcePath, contentType = "application/octet-stream") => {
  const stats = fs.statSync(sourcePath);
  const totalSize = stats.size;
  const rangeHeader = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");

  if (!rangeHeader) {
    res.setHeader("Content-Length", totalSize);
    fs.createReadStream(sourcePath).pipe(res);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/i.exec(rangeHeader);
  if (!match) {
    res.status(416).end();
    return;
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;
  const clampedStart = Number.isFinite(start) ? Math.max(0, Math.min(start, totalSize - 1)) : 0;
  const clampedEnd = Number.isFinite(end)
    ? Math.max(clampedStart, Math.min(end, totalSize - 1))
    : totalSize - 1;

  if (clampedStart >= totalSize || clampedEnd >= totalSize) {
    res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
    return;
  }

  res.status(206);
  res.setHeader("Content-Length", clampedEnd - clampedStart + 1);
  res.setHeader("Content-Range", `bytes ${clampedStart}-${clampedEnd}/${totalSize}`);
  fs.createReadStream(sourcePath, { end: clampedEnd, start: clampedStart }).pipe(res);
};

router.use(requireAuth);

router.get("/api/scenarios", (req, res) => {
  try {
    res.json(getScenarioCatalog(req.user.id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

router.get("/api/library", (req, res) => {
  try {
    res.json(getLibraryCatalog(req.user.id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

router.get("/api/scenarios/:scenarioId", (req, res) => {
  try {
    res.json(getScenarioDetails(req.user.id, req.params.scenarioId));
  } catch (error) {
    sendError(res, 404, error);
  }
});

router.post("/api/scenarios", jsonParser, (req, res) => {
  try {
    res.status(201).json(createScenario(req.user.id, req.body ?? {}));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.put("/api/scenarios/active", jsonParser, (req, res) => {
  try {
    res.json(setSelectedScenario(req.user.id, req.body?.scenarioId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.put("/api/scenarios/selected", jsonParser, (req, res) => {
  try {
    res.json(setSelectedScenario(req.user.id, req.body?.scenarioId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.put("/api/scenarios/:scenarioId", jsonParser, (req, res) => {
  try {
    res.json(updateScenario(req.user.id, req.params.scenarioId, req.body ?? {}));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.get("/api/scenarios/:scenarioId/export", (req, res) => {
  try {
    const mode = req.query?.mode === "full" ? "full" : "light";
    res.json(exportScenarioBundle(req.user.id, req.params.scenarioId, { mode }));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.post("/api/scenarios/import", largeJsonParser, (req, res) => {
  try {
    res.status(201).json(importScenarioBundle(req.user.id, req.body ?? {}, { setSelected: true }));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.get("/api/scenarios/:scenarioId/assets/:assetKey", (req, res) => {
  try {
    const asset = resolveScenarioUploadAsset(req.user.id, req.params.scenarioId, req.params.assetKey);
    streamBinaryFile(req, res, asset.sourcePath, asset.contentType);
  } catch (error) {
    sendError(res, 404, error);
  }
});

router.put("/api/scenarios/:scenarioId/assets/:assetKey", uploadParser, (req, res) => {
  try {
    const buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body ?? "");
    res.json(
      uploadScenarioAsset(
        req.user.id,
        req.params.scenarioId,
        req.params.assetKey,
        buffer,
        req.headers["content-type"],
      ),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.get("/api/games", (req, res) => {
  try {
    res.json(getGameCatalog(req.user.id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

router.get("/api/games/:gameId", (req, res) => {
  try {
    res.json(getGameDetails(req.user.id, req.params.gameId));
  } catch (error) {
    sendError(res, 404, error);
  }
});

router.post("/api/games", jsonParser, (req, res) => {
  try {
    res.status(201).json(createGame(req.user.id, req.body ?? {}));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.put("/api/games/active", jsonParser, (req, res) => {
  try {
    res.json(setActiveGame(req.user.id, req.body?.gameId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.put("/api/games/:gameId", jsonParser, (req, res) => {
  try {
    res.json(updateGame(req.user.id, req.params.gameId, req.body ?? {}));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.get("/api/games/:gameId/assets/:assetKey", (req, res) => {
  try {
    const asset = resolveGameUploadAsset(req.user.id, req.params.gameId, req.params.assetKey);
    streamBinaryFile(req, res, asset.sourcePath, asset.contentType);
  } catch (error) {
    sendError(res, 404, error);
  }
});

router.put("/api/games/:gameId/assets/:assetKey", uploadParser, (req, res) => {
  try {
    const buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body ?? "");
    res.json(
      uploadGameAsset(
        req.user.id,
        req.params.gameId,
        req.params.assetKey,
        buffer,
        req.headers["content-type"],
      ),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.delete("/api/games/:gameId", (req, res) => {
  try {
    res.json(deleteGame(req.user.id, req.params.gameId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.delete("/api/games/:gameId/assets/:assetKey", (req, res) => {
  try {
    res.json(removeGameAsset(req.user.id, req.params.gameId, req.params.assetKey));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.delete("/api/scenarios/:scenarioId/assets/:assetKey", (req, res) => {
  try {
    res.json(removeScenarioAsset(req.user.id, req.params.scenarioId, req.params.assetKey));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.delete("/api/scenarios/:scenarioId", (req, res) => {
  try {
    res.json(deleteScenario(req.user.id, req.params.scenarioId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.get("/api/runtime/json/:assetKey", (req, res) => {
  try {
    const asset = readRuntimeJsonAsset(req.user.id, req.params.assetKey);
    res.setHeader("Cache-Control", "no-store");
    res.type("application/json");
    res.send(JSON.stringify(asset.data));
  } catch (error) {
    sendError(res, 404, error);
  }
});

router.put("/api/runtime/json/:assetKey", jsonParser, (req, res) => {
  try {
    const asset = writeRuntimeJsonAsset(req.user.id, req.params.assetKey, req.body ?? {});
    res.setHeader("Cache-Control", "no-store");
    res.type("application/json");
    res.send(JSON.stringify(asset.data));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.get("/api/runtime/pmtiles/:assetKey", (req, res) => {
  try {
    const asset = resolveRuntimeBinaryAsset(req.user.id, req.params.assetKey);
    streamBinaryFile(req, res, asset.sourcePath, asset.contentType);
  } catch (error) {
    sendError(res, 404, error);
  }
});

router.head("/api/runtime/pmtiles/:assetKey", (req, res) => {
  try {
    const asset = resolveRuntimeBinaryAsset(req.user.id, req.params.assetKey);
    const stats = fs.statSync(asset.sourcePath);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).end();
  } catch (error) {
    sendError(res, 404, error);
  }
});

export default router;
