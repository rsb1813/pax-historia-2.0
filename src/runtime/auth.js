// 인증 API 클라이언트 — 세션 조회/로그인/로그아웃/회원가입/비밀번호 변경
const parseApiResponse = async (response) => {
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    return payload;
  }

  const message =
    payload?.error ||
    payload?.message ||
    `Request failed with HTTP ${response.status}`;
  throw new Error(message);
};

const requestJson = async (pathname, { body, method = "GET" } = {}) => {
  const response = await fetch(pathname, {
    body: body == null ? undefined : JSON.stringify(body),
    headers: body == null ? undefined : { "Content-Type": "application/json" },
    method,
  });

  return parseApiResponse(response);
};

// { hasUsers, authenticated, user }
export const getSessionState = () => requestJson("/api/auth/session");

// Bootstrap (no accounts yet) or invite-only (must already be logged in) —
// the server decides which applies. Returns { user }.
export const register = ({ email, password, displayName }) =>
  requestJson("/api/auth/register", {
    method: "POST",
    body: { email, password, displayName },
  });

// Returns { user }; rejects with the server's generic "Invalid email or
// password." message on failure (never reveals which field was wrong).
export const login = ({ email, password }) =>
  requestJson("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });

export const logout = () => requestJson("/api/auth/logout", { method: "POST" });

export const changePassword = ({ currentPassword, newPassword }) =>
  requestJson("/api/auth/password", {
    method: "PUT",
    body: { currentPassword, newPassword },
  });
