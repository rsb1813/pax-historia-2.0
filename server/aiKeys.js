// 프로바이더별 AI API 키를 암호화해 server/data/users/<userId>/secrets.json에 CRUD하는 헬퍼
//
// NOTE (검증 필요): server/auth/crypto.js는 아직 이 체크아웃에 존재하지 않는다
// (Phase 2-1, 별도 단계). 이 파일은 계획 문서(open-paxhistoria-accounts-phase2.md,
// "API 키 암호화" 섹션)가 서술하는 계약을 가정해 작성했다 —
//   encrypt(plaintext: string) -> { iv, ciphertext, authTag }
//   decrypt({ iv, ciphertext, authTag }) -> plaintext: string
// crypto.js가 실제로 만들어지기 전까지 아래 encrypt/decrypt 호출은 스모크테스트로
// 왕복 검증되지 않았다. 실제 시그니처가 다르면 이 파일도 맞춰 수정해야 한다.
import fs from "fs";
import path from "path";
import url from "url";
import { decrypt, encrypt } from "./auth/crypto.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const USERS_DIR = path.join(__dirname, "data", "users");

export const KNOWN_PROVIDERS = ["gemini", "openai", "anthropic", "openai-compatible"];

const requireUserId = (userId) => {
  if (!userId) {
    throw new Error("userId is required");
  }
  return String(userId);
};

const requireKnownProvider = (provider) => {
  if (!KNOWN_PROVIDERS.includes(provider)) {
    throw new Error(`Unknown AI provider: ${provider}`);
  }
  return provider;
};

const getUserDir = (userId) => path.join(USERS_DIR, requireUserId(userId));
const getSecretsPath = (userId) => path.join(getUserDir(userId), "secrets.json");

const readSecrets = (userId) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSecretsPath(userId), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeSecrets = (userId, value) => {
  fs.mkdirSync(getUserDir(userId), { recursive: true });
  fs.writeFileSync(getSecretsPath(userId), JSON.stringify(value, null, 2));
};

export const getKeyStatus = (userId) => {
  const secrets = readSecrets(userId);
  const status = {};
  for (const provider of KNOWN_PROVIDERS) {
    status[provider] = Boolean(secrets[provider]);
  }
  return status;
};

export const setKey = (userId, provider, plaintextOrNull) => {
  requireKnownProvider(provider);
  const secrets = readSecrets(userId);

  if (!plaintextOrNull) {
    delete secrets[provider];
  } else {
    const { iv, ciphertext, authTag } = encrypt(plaintextOrNull);
    secrets[provider] = { iv, ciphertext, authTag, updatedAt: new Date().toISOString() };
  }

  writeSecrets(userId, secrets);
};

export const revealKey = (userId, provider) => {
  requireKnownProvider(provider);
  const entry = readSecrets(userId)[provider];
  return entry ? decrypt(entry) : null;
};
