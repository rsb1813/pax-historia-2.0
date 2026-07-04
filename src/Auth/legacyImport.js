// 계정 시스템 도입 이전 이 브라우저의 localStorage에 남아있던 지도 설정/AI
// 프로바이더 설정·키/언어를 로그인 직후 1회 확인 후 계정으로 이전하는 모듈
import { normalizeProvider } from "../Game/AI/providerConfig.js";
import { getAccountSettings, patchAccountSettings, setProviderApiKey } from "../runtime/accountSettings.js";

// Keys matched the old localStorage-backed src/runtime/mapSettings.js
// (before it moved to the account settings cache).
const LEGACY_MAP_BOOLEAN_KEYS = {
    map_hide_country_labels: "hideCountryLabels",
    map_disable_idle_rotation: "disableIdleRotation",
    map_reverse_scroll_zoom: "reverseScrollZoom",
    map_disable_pan_inertia: "disablePanInertia",
    map_blur_sensitive_flags: "blurSensitiveFlags",
};

const LEGACY_MAP_NUMBER_KEYS = {
    map_zoom_sensitivity: "zoomSensitivity",
    map_border_width: "borderWidth",
    map_feature_size: "featureSize",
};

// Keys matched the old localStorage-backed src/Game/AI/providerConfig.js
// (before it moved to the account settings cache). Endpoint/model/custom
// params are plain settings; the four *_api_key keys below are secrets.
const LEGACY_AI_TEXT_KEYS = {
    gemini_model: ["gemini", "model"],
    gemini_custom_params: ["gemini", "customParams"],
    openai_model: ["openai", "model"],
    openai_custom_params: ["openai", "customParams"],
    anthropic_endpoint: ["anthropic", "endpoint"],
    anthropic_model: ["anthropic", "model"],
    anthropic_custom_params: ["anthropic", "customParams"],
    openai_compatible_endpoint: ["openai-compatible", "endpoint"],
    openai_compatible_model: ["openai-compatible", "model"],
    openai_compatible_custom_params: ["openai-compatible", "customParams"],
};

const LEGACY_API_KEY_KEYS = {
    gemini_api_key: "gemini",
    openai_api_key: "openai",
    anthropic_api_key: "anthropic",
    openai_compatible_api_key: "openai-compatible",
};

// Even older pre-rename keys from before the openai-compatible provider's
// endpoint/model storage keys were renamed. Mirrors the legacyKeys fallback
// that used to live in providerConfig.js's readStoredValue(): only used when
// the current key (the map value here) is absent from this browser.
const LEGACY_AI_TEXT_KEY_ALIASES = {
    custom_api_endpoint: "openai_compatible_endpoint",
    custom_api_model: "openai_compatible_model",
};

const ALL_LEGACY_KEYS = [
    ...Object.keys(LEGACY_MAP_BOOLEAN_KEYS),
    ...Object.keys(LEGACY_MAP_NUMBER_KEYS),
    "api_provider",
    "ai_reasoning_enabled",
    ...Object.keys(LEGACY_AI_TEXT_KEYS),
    ...Object.keys(LEGACY_AI_TEXT_KEY_ALIASES),
    ...Object.keys(LEGACY_API_KEY_KEYS),
    "ui_language",
];

const readLegacyKeys = () => {
    const found = {};
    for (const key of ALL_LEGACY_KEYS) {
        const value = localStorage.getItem(key);
        if (value !== null) found[key] = value;
    }
    return found;
};

// Builds one patchAccountSettings() payload for every non-secret legacy key,
// pushes the four API keys through setProviderApiKey (server-side encrypted
// storage), then clears every legacy key this pass actually touched.
const applyLegacyImport = async (legacy) => {
    const patch = {};

    for (const [key, field] of Object.entries(LEGACY_MAP_BOOLEAN_KEYS)) {
        if (key in legacy) {
            patch.mapSettings ??= {};
            patch.mapSettings[field] = legacy[key] === "1";
        }
    }

    for (const [key, field] of Object.entries(LEGACY_MAP_NUMBER_KEYS)) {
        if (key in legacy) {
            const parsed = Number(legacy[key]);
            if (Number.isFinite(parsed)) {
                patch.mapSettings ??= {};
                patch.mapSettings[field] = parsed;
            }
        }
    }

    if ("api_provider" in legacy) {
        patch.ai ??= {};
        patch.ai.activeProvider = normalizeProvider(legacy.api_provider);
    }

    if ("ai_reasoning_enabled" in legacy) {
        patch.ai ??= {};
        patch.ai.reasoningEnabled = legacy.ai_reasoning_enabled === "1";
    }

    for (const [key, [provider, field]] of Object.entries(LEGACY_AI_TEXT_KEYS)) {
        if (key in legacy) {
            patch.ai ??= {};
            patch.ai[provider] ??= {};
            patch.ai[provider][field] = legacy[key];
        }
    }

    for (const [aliasKey, primaryKey] of Object.entries(LEGACY_AI_TEXT_KEY_ALIASES)) {
        if (aliasKey in legacy && !(primaryKey in legacy)) {
            const [provider, field] = LEGACY_AI_TEXT_KEYS[primaryKey];
            patch.ai ??= {};
            patch.ai[provider] ??= {};
            patch.ai[provider][field] = legacy[aliasKey];
        }
    }

    if ("ui_language" in legacy) {
        patch.language = legacy.ui_language;
    }

    if (Object.keys(patch).length > 0) {
        patchAccountSettings(patch);
    }

    for (const [key, provider] of Object.entries(LEGACY_API_KEY_KEYS)) {
        if (key in legacy && legacy[key]) {
            await setProviderApiKey(provider, legacy[key]);
        }
    }

    for (const key of Object.keys(legacy)) {
        localStorage.removeItem(key);
    }
};

// Called by AuthGate right after loadAccountSettings() resolves. No-ops once
// the account has already been through this (importedLegacyLocalStorage) or
// when this browser has no legacy keys at all — only asks when there is
// something to actually import.
export async function importLegacyLocalStorage() {
    if (getAccountSettings().importedLegacyLocalStorage) return;

    const legacy = readLegacyKeys();
    if (Object.keys(legacy).length === 0) return;

    const shouldImport = window.confirm(
        "Found settings and AI provider keys saved in this browser from before accounts existed. " +
        "Import them into your account now? They'll be removed from this browser afterward.",
    );

    if (shouldImport) {
        try {
            await applyLegacyImport(legacy);
        } catch (err) {
            console.error("Failed to import legacy browser settings:", err);
        }
    }

    patchAccountSettings({ importedLegacyLocalStorage: true });
}
