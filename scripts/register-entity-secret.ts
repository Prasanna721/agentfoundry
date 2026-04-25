/**
 * Register a Circle Entity Secret for this CIRCLE_API_KEY.
 *
 * Flow:
 *   1. Generate 32 random bytes locally → that's the entity secret.
 *   2. Fetch Circle's RSA-2048 public key via /v1/w3s/config/entity/publicKey.
 *   3. RSA-OAEP-SHA256 encrypt the secret with that key.
 *   4. POST the ciphertext to /v1/w3s/config/entity/entitySecret.
 *      The response includes a `recoveryFile` we MUST persist (lets us
 *      decrypt the secret if we lose the plaintext).
 *   5. Append CIRCLE_ENTITY_SECRET=<hex> to .env.
 *
 * Validation:
 *   - After registration, we hit /v1/w3s/wallets which requires both API
 *     key + a fresh entity-secret-ciphertext header. If that returns 200,
 *     the secret is genuinely registered.
 */

import { randomBytes, publicEncrypt, constants, createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ENV_PATH = join(ROOT, ".env");
const RECOVERY_PATH = join(ROOT, "data", "circle-entity-recovery.dat");

const CIRCLE_BASE = "https://api.circle.com";
const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) {
  console.error("✖ CIRCLE_API_KEY missing — load .env first (run with `bun --env-file=.env scripts/register-entity-secret.ts`)");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${apiKey}` } as const;

// ---------- 1) generate entity secret ---------------------------------------
const entitySecretBytes = randomBytes(32);
const entitySecretHex = entitySecretBytes.toString("hex");
const fingerprint = createHash("sha256").update(entitySecretBytes).digest("hex").slice(0, 16);
console.log(`▸ generated entity secret: ${entitySecretHex.slice(0, 6)}…${entitySecretHex.slice(-4)} (sha256[:16] = ${fingerprint})`);

// ---------- 2) fetch RSA public key -----------------------------------------
const pkResp = await fetch(`${CIRCLE_BASE}/v1/w3s/config/entity/publicKey`, { headers: auth });
if (!pkResp.ok) {
  console.error("✖ failed to fetch public key:", pkResp.status, await pkResp.text());
  process.exit(1);
}
const pkBody = await pkResp.json() as { data?: { publicKey?: string } };
const publicKey = pkBody.data?.publicKey;
if (!publicKey) {
  console.error("✖ no publicKey in response:", JSON.stringify(pkBody));
  process.exit(1);
}
console.log(`▸ fetched Circle RSA public key (${publicKey.length} chars)`);

// ---------- 3) RSA-OAEP-SHA256 encrypt --------------------------------------
const encryptedBuf = publicEncrypt(
  {
    key: publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  },
  entitySecretBytes,
);
const ciphertextB64 = encryptedBuf.toString("base64");
console.log(`▸ encrypted entity secret → ciphertext (${ciphertextB64.length} b64 chars)`);

// ---------- 4) register the ciphertext --------------------------------------
const regResp = await fetch(`${CIRCLE_BASE}/v1/w3s/config/entity/entitySecret`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ entitySecretCiphertext: ciphertextB64 }),
});

if (!regResp.ok) {
  const text = await regResp.text();
  // 409 => already registered. Treat as a soft-fail: the user can recover from existing recoveryFile.
  if (regResp.status === 409) {
    console.warn("⚠ entity secret already registered for this API key. Re-using the secret we just generated will FAIL.");
    console.warn("  If you still have the original entity secret, set CIRCLE_ENTITY_SECRET in .env to that hex value.");
    console.warn("  Otherwise, rotate the API key in console.circle.com and rerun this script.");
    process.exit(2);
  }
  console.error("✖ register failed:", regResp.status, text);
  process.exit(1);
}

const regBody = await regResp.json() as {
  data?: {
    recoveryFile?: string;
  };
};
const recoveryFile = regBody.data?.recoveryFile;
if (!recoveryFile) {
  console.warn("⚠ no recoveryFile in response (response was 2xx though):", JSON.stringify(regBody).slice(0, 300));
}

// ---------- 5) persist secret + recovery ------------------------------------
if (recoveryFile) {
  writeFileSync(RECOVERY_PATH, recoveryFile, { mode: 0o600 });
  console.log(`▸ wrote recovery file → ${RECOVERY_PATH} (mode 600)`);
}

let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
const line = `CIRCLE_ENTITY_SECRET=${entitySecretHex}`;
if (/^CIRCLE_ENTITY_SECRET=/m.test(env)) {
  env = env.replace(/^CIRCLE_ENTITY_SECRET=.*$/m, line);
} else {
  env = env.replace(/(^CIRCLE_API_KEY=.*$)/m, `$1\n${line}`);
  if (!env.includes("CIRCLE_ENTITY_SECRET")) env += `\n${line}\n`;
}
writeFileSync(ENV_PATH, env);
console.log(`▸ persisted CIRCLE_ENTITY_SECRET → ${ENV_PATH}`);

// ---------- 6) real validation (hit a write-protected endpoint) -------------
// The entity secret authenticates write ops via a per-request fresh ciphertext.
// We re-encrypt the same secret with the same public key, then call /v1/w3s/wallets
// (a list call that still requires the entity-secret header).
function freshCiphertext(): string {
  return publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    entitySecretBytes,
  ).toString("base64");
}

const validateResp = await fetch(`${CIRCLE_BASE}/v1/w3s/wallets`, {
  headers: {
    ...auth,
    "X-Entity-Secret-Ciphertext": freshCiphertext(),
  },
});

console.log(`▸ validation: GET /v1/w3s/wallets → ${validateResp.status}`);
if (!validateResp.ok) {
  console.error("✖ validation failed:", await validateResp.text());
  process.exit(1);
}
const valBody = await validateResp.json() as { data?: { wallets?: unknown[] } };
console.log(`✓ entity secret registered & validated. wallet count = ${valBody.data?.wallets?.length ?? 0}`);
