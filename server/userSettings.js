// 계정별 설정을 server/data/users/<userId>/settings.json에 CRUD하는 헬퍼
import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const USERS_DIR = path.join(__dirname, "data", "users");

const DEFAULT_SETTINGS = {
  language: "en",
  mapSettings: {
    hideCountryLabels: false,
    disableIdleRotation: false,
    reverseScrollZoom: false,
    disablePanInertia: false,
    zoomSensitivity: 1,
    borderWidth: 1,
    featureSize: 1,
    blurSensitiveFlags: false,
    globeProjection: false,
    terrainEnabled: true,
  },
  ai: {
    activeProvider: "gemini",
    reasoningEnabled: false,
    gemini: { model: "", customParams: "" },
    openai: { model: "", customParams: "" },
    anthropic: { endpoint: "", model: "", customParams: "" },
    "openai-compatible": { endpoint: "http://localhost:11434/v1", model: "", customParams: "" },
  },
  library: {
    activeGameId: "",
    selectedScenarioId: "default",
    gameOrder: [],
  },
  importedLegacyLocalStorage: false,
};

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// base 위에 patch를 재귀적으로 얹는다. 양쪽 다 순수 객체인 키만 재귀 병합하고,
// 그 외(배열/원시값/null)는 patch 쪽 값으로 통째로 교체한다.
const deepMerge = (base, patch) => {
  if (!isPlainObject(patch)) {
    return patch === undefined ? base : patch;
  }

  const result = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(result[key]) && isPlainObject(value) ? deepMerge(result[key], value) : value;
  }

  return result;
};

const requireUserId = (userId) => {
  if (!userId) {
    throw new Error("userId is required");
  }
  return String(userId);
};

const getUserDir = (userId) => path.join(USERS_DIR, requireUserId(userId));
const getSettingsPath = (userId) => path.join(getUserDir(userId), "settings.json");

const readStoredSettings = (userId) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSettingsPath(userId), "utf8"));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeStoredSettings = (userId, value) => {
  fs.mkdirSync(getUserDir(userId), { recursive: true });
  fs.writeFileSync(getSettingsPath(userId), JSON.stringify(value, null, 2));
};

export const getSettings = (userId) => deepMerge(DEFAULT_SETTINGS, readStoredSettings(userId));

export const patchSettings = (userId, partial) => {
  const nextStored = deepMerge(readStoredSettings(userId), partial ?? {});
  writeStoredSettings(userId, nextStored);
  return deepMerge(DEFAULT_SETTINGS, nextStored);
};
