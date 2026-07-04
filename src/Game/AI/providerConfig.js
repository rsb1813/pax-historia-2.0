/*! Open Historia — portions (reasoning-effort toggle persistence) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// AI 프로바이더의 비밀이 아닌 설정(엔드포인트/모델/커스텀파라미터/활성 프로바이더/추론
// 토글)을 계정 설정 캐시(runtime/accountSettings.js)에서 읽고 쓴다. API 키는 이 파일이
// 다루지 않는다 — hasProviderApiKey/revealProviderApiKey/setProviderApiKey(모두
// accountSettings.js)를 직접 사용한다.
import { getAccountSettings, patchAccountSettings } from "../../runtime/accountSettings.js";

export const DEFAULT_PROVIDER = "gemini";

export const PROVIDER_OPTIONS = [
    {
        value: "gemini",
        label: "Gemini",
        group: "Native APIs",
        description: "Google AI Studio / Gemini API",
        searchTerms: ["google", "ai studio", "generativelanguage"],
    },
    {
        value: "openai",
        label: "OpenAI",
        group: "Native APIs",
        description: "Official OpenAI API",
        searchTerms: ["gpt", "o3", "o4", "responses", "chatgpt"],
    },
    {
        value: "anthropic",
        label: "Anthropic",
        group: "Native APIs",
        description: "Claude via Messages API",
        searchTerms: ["claude", "haiku", "sonnet", "opus"],
    },
    {
        value: "openai-compatible",
        label: "OpenAI Compatible",
        group: "Gateways and self-hosted",
        description: "Ollama, LM Studio, OpenRouter, local gateways",
        searchTerms: ["ollama", "lm studio", "openrouter", "vllm", "gateway", "proxy"],
    },
];

// Which non-secret fields exist per provider in accountSettings' ai.* namespace
// (see server/userSettings.js DEFAULT_SETTINGS.ai).
const PROVIDER_FIELDS = {
    gemini: ["model", "customParams"],
    openai: ["model", "customParams"],
    anthropic: ["endpoint", "model", "customParams"],
    "openai-compatible": ["endpoint", "model", "customParams"],
};

const FORM_FIELD_MAP = {
    geminiModel: { provider: "gemini", field: "model" },
    geminiCustomParams: { provider: "gemini", field: "customParams" },
    openaiModel: { provider: "openai", field: "model" },
    openaiCustomParams: { provider: "openai", field: "customParams" },
    anthropicEndpoint: { provider: "anthropic", field: "endpoint" },
    anthropicModel: { provider: "anthropic", field: "model" },
    anthropicCustomParams: { provider: "anthropic", field: "customParams" },
    openaiCompatibleEndpoint: { provider: "openai-compatible", field: "endpoint" },
    openaiCompatibleModel: { provider: "openai-compatible", field: "model" },
    openaiCompatibleCustomParams: { provider: "openai-compatible", field: "customParams" },
};

function isSupportedProvider(value) {
    return PROVIDER_OPTIONS.some((provider) => provider.value === value);
}

export function normalizeProvider(provider) {
    if (provider === "custom") return "openai-compatible";
    return isSupportedProvider(provider) ? provider : DEFAULT_PROVIDER;
}

export function getStoredProvider() {
    return normalizeProvider(getAccountSettings().ai?.activeProvider);
}

export function setStoredProvider(provider) {
    patchAccountSettings({ ai: { activeProvider: normalizeProvider(provider) } });
}

export function getProviderMeta(provider) {
    return PROVIDER_OPTIONS.find((option) => option.value === normalizeProvider(provider))
        ?? PROVIDER_OPTIONS[0];
}

export function providerSupportsModelDiscovery(provider) {
    const normalized = normalizeProvider(provider);
    return normalized === "openai" || normalized === "openai-compatible";
}

export function getProviderField(provider, field) {
    const normalized = normalizeProvider(provider);
    if (!PROVIDER_FIELDS[normalized]?.includes(field)) return "";
    return getAccountSettings().ai?.[normalized]?.[field] ?? "";
}

export function setProviderField(provider, field, value) {
    const normalized = normalizeProvider(provider);
    if (!PROVIDER_FIELDS[normalized]?.includes(field)) return;
    patchAccountSettings({ ai: { [normalized]: { [field]: value ?? "" } } });
}

export function getProviderSettings(provider) {
    const normalized = normalizeProvider(provider);
    return {
        provider: normalized,
        endpoint: getProviderField(normalized, "endpoint"),
        model: getProviderField(normalized, "model"),
        customParams: getProviderField(normalized, "customParams"),
    };
}

// Global "model reasoning" toggle — applied by callAI in every provider mode
// (Gemini thinkingConfig, OpenAI/compatible reasoning_effort, Anthropic thinking).
export function getReasoningEnabled() {
    return Boolean(getAccountSettings().ai?.reasoningEnabled);
}

export function setReasoningEnabled(enabled) {
    patchAccountSettings({ ai: { reasoningEnabled: Boolean(enabled) } });
}

export function loadProviderSettingsFormState() {
    const state = {};

    for (const [stateKey, mapping] of Object.entries(FORM_FIELD_MAP)) {
        state[stateKey] = getProviderField(mapping.provider, mapping.field);
    }

    return state;
}

export function persistProviderSetting(stateKey, value) {
    const mapping = FORM_FIELD_MAP[stateKey];
    if (!mapping) return;
    setProviderField(mapping.provider, mapping.field, value);
}
