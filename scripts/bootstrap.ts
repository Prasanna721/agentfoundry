/**
 * Bootstrap roles onto existing Arc Testnet Circle wallets.
 *
 * The codex run already created wallets in this entity. Rather than
 * creating new ones (and burning Circle's per-team rate limit), we
 * enumerate what's there and assign role labels.
 *
 * Roles, in order of largest USDC balance first:
 *   CREATOR   — posts forges and picks winners
 *   SMITH_1   — agent that solves forges (will be driven by Codex CLI)
 *   SMITH_2   — agent that solves forges (will be driven by Claude Code CLI)
 *   SMITH_3   — spare / second creator if needed
 *
 * Persists to .env with both wallet ID and address per role.
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const apiKey       = process.env.CIRCLE_API_KEY!;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
const usdc         = (process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000") as `0x${string}`;
const rpc          = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network/";
const ENV_PATH     = join(process.cwd(), ".env");

if (!apiKey || !entitySecret) { console.error("✖ missing CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET"); process.exit(1); }

const dcw = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const pub = createPublicClient({ transport: http(rpc) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const resp = await dcw.listWallets({ blockchain: "ARC-TESTNET" });
const wallets = resp.data?.wallets ?? [];
if (wallets.length === 0) { console.error("✖ no Arc Testnet wallets found"); process.exit(1); }

// Enrich with USDC balance and sort largest-first.
const enriched = await Promise.all(wallets.map(async (w) => {
  const b = await pub.readContract({
    address: usdc,
    abi: erc20,
    functionName: "balanceOf",
    args: [w.address as `0x${string}`],
  }) as bigint;
  return { id: w.id!, address: w.address!, balance: b };
}));
enriched.sort((a, b) => Number(b.balance - a.balance));

console.log("▸ Arc Testnet wallets (sorted by USDC):");
for (const w of enriched) console.log(`    ${w.id}  ${w.address}  ${formatUnits(w.balance, 6)} USDC`);

const roles = ["CREATOR", "SMITH_1", "SMITH_2", "SMITH_3"];
const assignments: Record<string, { id: string; address: string }> = {};
for (let i = 0; i < Math.min(roles.length, enriched.length); i++) {
  assignments[roles[i]] = { id: enriched[i].id, address: enriched[i].address };
}

console.log("\n▸ role assignments:");
for (const [role, w] of Object.entries(assignments)) {
  console.log(`    ${role.padEnd(10)} = ${w.address}  (wallet ${w.id})`);
}

// Write into .env, idempotent.
let env = readFileSync(ENV_PATH, "utf8");
const block: string[] = ["", "# --- bootstrap: role -> Circle wallet (id + address) ---"];
for (const [role, w] of Object.entries(assignments)) {
  const idLine = `WALLET_${role}_ID=${w.id}`;
  const addrLine = `WALLET_${role}_ADDRESS=${w.address}`;
  for (const line of [idLine, addrLine]) {
    const key = line.split("=")[0];
    if (env.includes(`${key}=`)) {
      env = env.replace(new RegExp(`^${key}=.*$`, "m"), line);
    } else {
      block.push(line);
    }
  }
}
if (block.length > 2) env += "\n" + block.join("\n") + "\n";
writeFileSync(ENV_PATH, env);
console.log(`\n✓ wrote role assignments to .env`);
