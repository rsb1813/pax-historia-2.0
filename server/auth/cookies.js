// 세션 쿠키 읽기/쓰기/삭제 — Cookie 요청 헤더는 npm cookie 패키지 없이 직접 파싱한다
const SESSION_COOKIE_NAME = "session";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const readSessionToken = (req) => {
  const header = req.headers?.cookie;
  if (!header || typeof header !== "string") return null;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;

    const name = part.slice(0, eq).trim();
    if (name !== SESSION_COOKIE_NAME) continue;

    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
};

export const writeSessionCookie = (res, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(res.req?.secure),
    maxAge: THIRTY_DAYS_MS,
    path: "/",
  });
};

export const clearSessionCookie = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(res.req?.secure),
    path: "/",
  });
};
