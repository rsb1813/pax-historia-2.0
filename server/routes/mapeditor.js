// 맵 에디터 문서 CRUD를 계정별 소유권 검증과 함께 제공하는 Express 라우터 —
// mapEditorStore.js의 리팩터된(userId 필수) 함수를 감싼다.
// 아직 server.js에 마운트되지 않았고, server.js의 기존 인라인 라우트도 그대로
// 남아 있다(다음 단계에서 한 번에 교체 예정 — 그 전까지는 앱이 계속 돌아가야 하므로).
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createMapEditorDocument,
  deleteMapEditorDocument,
  getMapEditorCatalog,
  getMapEditorDocument,
  updateMapEditorDocument,
} from "../mapEditorStore.js";

const router = express.Router();
const largeJsonParser = express.json({ limit: "2048mb" });

const sendError = (res, statusCode, error) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(statusCode).json({ error: message });
};

router.use(requireAuth);

router.get("/api/mapeditor/documents", (req, res) => {
  try {
    res.json(getMapEditorCatalog(req.user.id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

router.post("/api/mapeditor/documents", largeJsonParser, (req, res) => {
  try {
    res.status(201).json(createMapEditorDocument(req.user.id, req.body ?? {}));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.get("/api/mapeditor/documents/:id", (req, res) => {
  try {
    res.json(getMapEditorDocument(req.user.id, req.params.id));
  } catch (error) {
    sendError(res, 404, error);
  }
});

router.put("/api/mapeditor/documents/:id", largeJsonParser, (req, res) => {
  try {
    res.json(updateMapEditorDocument(req.user.id, req.params.id, req.body ?? {}));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.delete("/api/mapeditor/documents/:id", (req, res) => {
  try {
    res.json(deleteMapEditorDocument(req.user.id, req.params.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

export default router;
