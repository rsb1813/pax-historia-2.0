// 계정 설정(settings)과 AI 프로바이더 키 CRUD를 제공하는 Express 라우터
//
// NOTE (검증 필요): server/middleware/requireAuth.js는 아직 이 체크아웃에
// 존재하지 않는다(Phase 2-2, 별도 단계). 아래 requireAuth import는 계획 문서가
// 서술하는 계약(요청을 인증하고 req.user.id를 채워 넣는 미들웨어, named export)을
// 가정한 것이며, 실제 파일이 만들어지기 전까지 이 라우터는 스모크테스트로
// 검증되지 않았다.
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getKeyStatus, KNOWN_PROVIDERS, revealKey, setKey } from "../aiKeys.js";
import { getSettings, patchSettings } from "../userSettings.js";

const router = express.Router();
const jsonParser = express.json({ limit: "64mb" });

const sendError = (res, statusCode, error) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(statusCode).json({ error: message });
};

router.use(requireAuth);

router.get("/settings", (req, res) => {
  try {
    res.json(getSettings(req.user.id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

router.put("/settings", jsonParser, (req, res) => {
  try {
    res.json(patchSettings(req.user.id, req.body ?? {}));
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.get("/ai-keys", (req, res) => {
  try {
    res.json(getKeyStatus(req.user.id));
  } catch (error) {
    sendError(res, 500, error);
  }
});

router.put("/ai-keys/:provider", jsonParser, (req, res) => {
  try {
    if (!KNOWN_PROVIDERS.includes(req.params.provider)) {
      return sendError(res, 400, new Error(`Unknown AI provider: ${req.params.provider}`));
    }
    setKey(req.user.id, req.params.provider, req.body?.key ?? null);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.get("/ai-keys/:provider/reveal", (req, res) => {
  try {
    if (!KNOWN_PROVIDERS.includes(req.params.provider)) {
      return sendError(res, 400, new Error(`Unknown AI provider: ${req.params.provider}`));
    }
    res.json({ value: revealKey(req.user.id, req.params.provider) });
  } catch (error) {
    sendError(res, 500, error);
  }
});

export default router;
