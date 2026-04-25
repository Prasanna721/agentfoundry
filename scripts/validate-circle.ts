/**
 * Validates that the registered CIRCLE_ENTITY_SECRET works.
 *
 * Hits GET /v1/w3s/wallets which requires a fresh entity-secret ciphertext
 * header on each call. A 200 response proves the secret matches what Circle
 * has registered.
 */

import { publicEncrypt, constants } from "node:crypto";

const apiKey = process.env.CIRCLE_API_KEY!;
const entitySecretHex = process.env.CIRCLE_ENTITY_SECRET!;
if (!apiKey || !entitySecretHex) {
  console.error("✖ missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET");
  process.exit(1);
}
const entitySecret = Buffer.from(entitySecretHex, "hex");
if (entitySecret.length !== 32) {
  console.error(`✖ entity secret must be exactly 32 bytes, got ${entitySecret.length}`);
  process.exit(1);
}

const BASE = "https://api.circle.com";

const pkResp = await fetch(`${BASE}/v1/w3s/config/entity/publicKey`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (!pkResp.ok) { console.error("✖ pk fetch:", pkResp.status, await pkResp.text()); process.exit(1); }
const publicKey = (await pkResp.json() as any).data?.publicKey as string;

function freshCiphertext(): string {
  return publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    entitySecret,
  ).toString("base64");
}

const r = await fetch(`${BASE}/v1/w3s/wallets`, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "X-Entity-Secret-Ciphertext": freshCiphertext(),
  },
});

console.log(`▸ GET /v1/w3s/wallets → ${r.status}`);
const body = await r.text();
if (!r.ok) {
  console.error("✖ entity secret invalid for this API key:", body);
  process.exit(1);
}
const json = JSON.parse(body);
const count = json.data?.wallets?.length ?? 0;
console.log(`✓ entity secret VALID (returned ${count} pre-existing wallets)`);
if (count > 0) {
  console.log("  pre-existing wallets (created by codex run):");
  for (const w of json.data.wallets.slice(0, 10)) {
    console.log(`    - ${w.id}  ${w.blockchain ?? "?"}  ${w.address ?? "(no addr)"}`);
  }
}
