// 서버에 저장된 계정 설정(mapSettings/ai/library)과 AI 프로바이더 키 상태를 동기
// 캐시로 노출하는 런타임 모듈. AuthGate가 로그인 직후 loadAccountSettings()/
// loadAiKeyStatus()를 한 번 호출해 캐시를 채우고, 그 이후 모든 컴포넌트는
// getAccountSettings()/hasProviderApiKey()로 이 캐시를 동기 조회한다.
const SETTINGS_UPDATED_EVENT = "accountSettings:updated";
const REVEAL_TTL_MS = 15 * 60 * 1000;

// server/userSettings.js의 DEFAULT_SETTINGS와 동일한 모양 — 로드가 끝나기 전에도
// 동기 소비자(useMapSetting 초기값, getStoredProvider 등)가 안전한 기본값을
// 읽을 수 있도록 한다.
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

// base 위에 patch를 재귀적으로 얹는다 (server/userSettings.js의 deepMerge와 동일 규칙).
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

let settingsCache = DEFAULT_SETTINGS;
let keyStatusCache = {};
const revealCache = new Map(); // provider -> { value, expiresAt }

const notifyUpdated = () => {
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
};

const parseJsonResponse = async (response) => {
    if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}`);
    }
    return response.json();
};

// AuthGate가 세션 확인 직후 1회 호출한다.
export async function loadAccountSettings() {
    const data = await parseJsonResponse(await fetch("/api/account/settings"));
    settingsCache = deepMerge(DEFAULT_SETTINGS, data);
    notifyUpdated();
    return settingsCache;
}

export function getAccountSettings() {
    return settingsCache;
}

// 낙관적 업데이트: 캐시를 즉시 갱신하고 구독자에게 알린 뒤, 서버 저장은
// fire-and-forget으로 뒤에서 진행한다.
export function patchAccountSettings(partial) {
    settingsCache = deepMerge(settingsCache, partial ?? {});
    notifyUpdated();

    fetch("/api/account/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial ?? {}),
    }).catch((error) => {
        console.warn("Failed to save account settings:", error);
    });

    return settingsCache;
}

// AuthGate가 세션 확인 직후 1회 호출한다.
export async function loadAiKeyStatus() {
    keyStatusCache = await parseJsonResponse(await fetch("/api/account/ai-keys"));
    return keyStatusCache;
}

export function hasProviderApiKey(provider) {
    return Boolean(keyStatusCache[provider]);
}

// 실제 평문 키를 서버에서 복호화해 가져온다 (Gemini/기본엔드포인트 Anthropic처럼
// 브라우저가 프로바이더를 직접 호출하는 경로 전용). 15분 TTL로 캐시.
export async function revealProviderApiKey(provider) {
    const cached = revealCache.get(provider);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const { value } = await parseJsonResponse(
        await fetch(`/api/account/ai-keys/${encodeURIComponent(provider)}/reveal`),
    );
    revealCache.set(provider, { value, expiresAt: Date.now() + REVEAL_TTL_MS });
    return value;
}

export async function setProviderApiKey(provider, valueOrNull) {
    await parseJsonResponse(
        await fetch(`/api/account/ai-keys/${encodeURIComponent(provider)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: valueOrNull ?? null }),
        }),
    );

    revealCache.delete(provider);
    keyStatusCache = { ...keyStatusCache, [provider]: Boolean(valueOrNull) };
}
