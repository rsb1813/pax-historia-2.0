// AES-256-GCM으로 평문을 암호화/복호화하는 모듈 — 마스터 키는 server/secrets/master.key
//
// 마스터 키는 server/data/ 밖(server/secrets/)에 둔다. 암호문과 키가 같은 곳에 있으면
// 한쪽이 유출됐을 때 둘 다 함께 노출되기 때문이다. PAX_MASTER_KEY 환경변수로 오버라이드할
// 수 있으며, 이 경우에도 정확히 32바이트로 디코드되지 않으면 즉시(fail-fast) 죽는다.
// master.key 파일이 이미 존재하는데 읽을 수 없거나 길이가 틀리면 절대 조용히
// 재생성하지 않고 그대로 에러를 던진다 — 조용한 재생성은 기존 암호문을 전부 복호화
// 불가능하게 만들기 때문이다.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SECRETS_DIR = path.join(__dirname, "..", "secrets");
const MASTER_KEY_PATH = path.join(SECRETS_DIR, "master.key");

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM 표준 nonce 길이

const loadMasterKeyFromEnv = () => {
  const raw = process.env.PAX_MASTER_KEY;
  if (!raw) return null;

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_LENGTH) {
    throw new Error(
      `PAX_MASTER_KEY must decode to exactly ${KEY_LENGTH} bytes (got ${decoded.length}). Refusing to start.`,
    );
  }
  return decoded;
};

const loadOrCreateMasterKeyFromDisk = () => {
  if (fs.existsSync(MASTER_KEY_PATH)) {
    let key;
    try {
      key = fs.readFileSync(MASTER_KEY_PATH);
    } catch (error) {
      throw new Error(
        `Failed to read master key at ${MASTER_KEY_PATH}: ${error.message}. Refusing to start — it will NOT be silently regenerated.`,
      );
    }
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `Master key at ${MASTER_KEY_PATH} is ${key.length} bytes, expected ${KEY_LENGTH}. Refusing to start — fix or remove this file manually, it will NOT be silently regenerated.`,
      );
    }
    return key;
  }

  const key = randomBytes(KEY_LENGTH);
  fs.mkdirSync(SECRETS_DIR, { recursive: true });
  fs.writeFileSync(MASTER_KEY_PATH, key, { mode: 0o600 });
  return key;
};

const MASTER_KEY = loadMasterKeyFromEnv() ?? loadOrCreateMasterKeyFromDisk();

export const encrypt = (plaintext) => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, MASTER_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: authTag.toString("base64"),
  };
};

export const decrypt = ({ iv, ciphertext, authTag }) => {
  const decipher = createDecipheriv(ALGORITHM, MASTER_KEY, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
};
