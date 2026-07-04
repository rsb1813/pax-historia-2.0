// server/data/sessions.json 기반 세션 CRUD + 인메모리 Map<tokenHash, session> 미러
//
// 원본 토큰은 쿠키에만 존재하며, 디스크/메모리에는 SHA-256 해시만 저장한다.
// 30일 슬라이딩 만료: touchSession()이 호출될 때마다 expiresAt이 30일 뒤로 밀린다.
// 디스크 쓰기는 세션당 최대 10분에 한 번으로 스로틀링한다(매 요청마다 파일을
// 다시 쓰지 않기 위함) — in-memory 상태는 항상 즉시 최신이다.
import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SESSIONS_PATH = path.join(__dirname, "..", "data", "sessions.json");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_WRITE_THROTTLE_MS = 10 * 60 * 1000;

const readJsonFile = (targetPath, fallback = null) => {
  if (!fs.existsSync(targetPath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf-8"));
  } catch (error) {
    console.error(`Failed to parse JSON file: ${targetPath}`, error);
    return fallback;
  }
};

const writeSessionsToDisk = (sessions) => {
  fs.mkdirSync(path.dirname(SESSIONS_PATH), { recursive: true });
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2), "utf-8");
};

const hashToken = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

// tokenHash -> session (session also carries a private _lastPersistedAt used
// only to throttle disk writes; it is stripped before persisting/returning).
const sessionsByTokenHash = new Map();

const loadSessionsFromDisk = () => {
  const stored = readJsonFile(SESSIONS_PATH, []);
  const list = Array.isArray(stored) ? stored : [];
  sessionsByTokenHash.clear();
  for (const session of list) {
    if (session && typeof session.tokenHash === "string") {
      sessionsByTokenHash.set(session.tokenHash, { ...session, _lastPersistedAt: Date.now() });
    }
  }
};

loadSessionsFromDisk();

const persist = () => {
  const list = [...sessionsByTokenHash.values()].map(({ _lastPersistedAt, ...rest }) => rest);
  writeSessionsToDisk(list);
};

const stripInternal = (session) => {
  const { _lastPersistedAt, ...rest } = session;
  return rest;
};

const isExpired = (session) => new Date(session.expiresAt).getTime() <= Date.now();

export const createSession = (userId) => {
  if (!userId) throw new Error("userId is required");

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  const session = {
    tokenHash,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + THIRTY_DAYS_MS).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
  };

  sessionsByTokenHash.set(tokenHash, { ...session, _lastPersistedAt: now });
  persist();
  return rawToken;
};

export const getSessionByToken = (rawToken) => {
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const session = sessionsByTokenHash.get(tokenHash);
  if (!session) return null;

  if (isExpired(session)) {
    sessionsByTokenHash.delete(tokenHash);
    persist();
    return null;
  }

  return stripInternal(session);
};

export const touchSession = (tokenHash) => {
  const session = sessionsByTokenHash.get(tokenHash);
  if (!session || isExpired(session)) return;

  const now = Date.now();
  session.lastSeenAt = new Date(now).toISOString();
  session.expiresAt = new Date(now + THIRTY_DAYS_MS).toISOString();

  if (now - (session._lastPersistedAt ?? 0) >= TOUCH_WRITE_THROTTLE_MS) {
    session._lastPersistedAt = now;
    persist();
  }
};

export const deleteSession = (tokenHash) => {
  if (sessionsByTokenHash.delete(tokenHash)) {
    persist();
  }
};

export const deleteAllSessionsForUser = (userId) => {
  let changed = false;
  for (const [tokenHash, session] of sessionsByTokenHash) {
    if (session.userId === userId) {
      sessionsByTokenHash.delete(tokenHash);
      changed = true;
    }
  }
  if (changed) persist();
};
