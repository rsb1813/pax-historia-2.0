// 세션 쿠키를 검증해 req.user를 채우는 Express 인증 미들웨어
import { readSessionToken } from "../auth/cookies.js";
import { getSessionByToken, touchSession } from "../auth/sessions.js";
import { findUserById } from "../auth/users.js";

export const requireAuth = (req, res, next) => {
  const token = readSessionToken(req);
  const session = token ? getSessionByToken(token) : null;
  if (!session) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  const user = findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  req.user = { id: user.id, email: user.email, displayName: user.displayName };

  // 세션 갱신이 응답을 지연시키지 않도록 fire-and-forget으로 처리한다.
  setImmediate(() => touchSession(session.tokenHash));

  next();
};
