// 인증 라우터 — 세션 조회 / 회원가입(부트스트랩 또는 초대제) / 로그인 / 로그아웃 / 비밀번호 변경
import express from "express";
import { clearSessionCookie, readSessionToken, writeSessionCookie } from "../auth/cookies.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { createSession, deleteSession, getSessionByToken } from "../auth/sessions.js";
import { createUser, findUserByEmail, findUserById, listUsers, setPassword } from "../auth/users.js";
import { migrateExistingDataToFirstAccount } from "../migration.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();
const jsonParser = express.json({ limit: "1mb" });

const MIN_PASSWORD_LENGTH = 10;

// 존재하지 않는 이메일로 로그인 시도해도 scrypt 계산 시간이 소요되도록 하는
// 더미 해시 — 응답 시간 차이로 계정 존재 여부가 드러나는 것(enumeration)을 막는다.
const DUMMY_PASSWORD_HASH = hashPassword("this-dummy-hash-only-equalizes-login-timing");

const sendError = (res, statusCode, error) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(statusCode).json({ error: message });
};

const toPublicUser = (user) => ({ id: user.id, email: user.email, displayName: user.displayName });

// 부트스트랩(계정이 하나도 없을 때)에는 열려 있고, 그 외에는 초대제(로그인 필요)다.
const requireAuthUnlessBootstrapping = (req, res, next) => {
  if (listUsers().length === 0) return next();
  return requireAuth(req, res, next);
};

router.get("/session", (req, res) => {
  const hasUsers = listUsers().length > 0;
  const token = readSessionToken(req);
  const session = token ? getSessionByToken(token) : null;
  const user = session ? findUserById(session.userId) : null;

  res.json({
    hasUsers,
    authenticated: Boolean(user),
    user: user ? toPublicUser(user) : null,
  });
});

router.post("/register", jsonParser, requireAuthUnlessBootstrapping, async (req, res) => {
  try {
    const { email, password, displayName } = req.body ?? {};
    const isBootstrap = !req.user;

    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return sendError(res, 400, new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`));
    }
    if (typeof email !== "string" || !email.trim()) {
      return sendError(res, 400, new Error("Email is required."));
    }
    if (findUserByEmail(email)) {
      return sendError(res, 400, new Error("Email already in use."));
    }

    const user = createUser({ email, password, displayName });

    if (isBootstrap) {
      await migrateExistingDataToFirstAccount(user.id);
    }

    const token = createSession(user.id);
    writeSessionCookie(res, token);
    res.status(201).json({ user: toPublicUser(user) });
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.post("/login", jsonParser, (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const user = typeof email === "string" ? findUserByEmail(email) : null;
    const passwordOk = verifyPassword(password, user ? user.passwordHash : DUMMY_PASSWORD_HASH);

    if (!user || !passwordOk) {
      return sendError(res, 401, new Error("Invalid email or password."));
    }

    const token = createSession(user.id);
    writeSessionCookie(res, token);
    res.json({ user: toPublicUser(user) });
  } catch (error) {
    sendError(res, 400, error);
  }
});

router.post("/logout", requireAuth, (req, res) => {
  const token = readSessionToken(req);
  const session = token ? getSessionByToken(token) : null;
  if (session) deleteSession(session.tokenHash);

  clearSessionCookie(res);
  res.json({ ok: true });
});

router.put("/password", requireAuth, jsonParser, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    const user = findUserById(req.user.id);
    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      return sendError(res, 401, new Error("Current password is incorrect."));
    }
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return sendError(res, 400, new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`));
    }

    setPassword(user.id, newPassword);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, 400, error);
  }
});

export default router;
