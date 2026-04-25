/**
 * Faucet helper.
 *
 * 1. Tries Circle's programmatic faucet first (POST /v1/faucet/drips).
 *    NOTE: this endpoint requires a MAINNET API key; it returns 403 with
 *    a sandbox/test key. We log the failure and fall through.
 *
 * 2. If programmatic drip is unavailable, prints the addresses for the
 *    user (or another tool) to drip via https://faucet.circle.com/.
 *
 * 3. Polls USDC balanceOf(address) on Arc Testnet until each wallet has
 *    a non-zero balance. Exits 0 once all are funded.
 */

import { createPublicClient, http, parseAbi, formatUnits } from "viem";

const apiKey  = process.env.CIRCLE_API_KEY!;
const rpc     = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network/";
const usdcAddr = (process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000") as `0x${string}`;

if (!apiKey) { console.error("✖ CIRCLE_API_KEY missing"); process.exit(1); }

const cliArgs = process.argv.slice(2);
const cliAddrs = cliArgs.filter((a) => a.startsWith("0x"));
const fallback = [
  "0x8873f1291ecafe63d4d835256936af930bc7966d",
  "0x9026ba7a1abe85d194d5a6ddd348d74f0afdfa4f",
  "0xc0d9742f62210bbdf3732d8234d866a22b96285a",
  "0x78946f219455c337bc22ab8591d782d7350b375a",
] as const;
const addresses = (cliAddrs.length > 0 ? cliAddrs : fallback) as readonly `0x${string}`[];

const pollMode = cliArgs.includes("--poll");
const onlyDrip = cliArgs.includes("--drip-only");

const client = createPublicClient({ transport: http(rpc) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

async function balance(addr: `0x${string}`): Promise<bigint> {
  return await client.readContract({
    address: usdcAddr,
    abi: erc20,
    functionName: "balanceOf",
    args: [addr],
  }) as bigint;
}

async function tryDrip(addr: string): Promise<{ ok: boolean; status: number; body: string }> {
  const r = await fetch("https://api.circle.com/v1/faucet/drips", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ blockchain: "ARC-TESTNET", address: addr, usdc: true, native: true }),
  });
  return { ok: r.ok, status: r.status, body: (await r.text()).slice(0, 200) };
}

// --- 1) attempt programmatic drips (will 403 on sandbox key) -----------------
if (!pollMode) {
  console.log("▸ attempting Circle programmatic faucet...");
  let mainnetBlocked = false;
  for (const addr of addresses) {
    const r = await tryDrip(addr);
    if (r.status === 403) {
      mainnetBlocked = true;
      console.log(`  ${addr}  403 — programmatic faucet requires mainnet API key`);
      break;
    }
    console.log(`  ${addr}  ${r.status}  ${r.body}`);
  }
  if (mainnetBlocked) {
    console.log("\n▸ falling back to manual UI faucet at https://faucet.circle.com/");
    console.log("  paste each address, select Arc Testnet, click drip USDC + native:\n");
    for (const a of addresses) console.log(`    ${a}`);
  }
}

if (onlyDrip) process.exit(0);

// --- 2) poll until each wallet is funded ------------------------------------
console.log("\n▸ polling USDC balances on Arc Testnet (Ctrl-C to abort)...");
const target = new Map<string, bigint>(addresses.map((a) => [a, 0n]));
const start = Date.now();
const TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes
const INTERVAL_MS = 5_000;

while (Date.now() - start < TIMEOUT_MS) {
  let allFunded = true;
  let line = "";
  for (const a of addresses) {
    const b = await balance(a);
    target.set(a, b);
    line += `${a.slice(0, 8)}…=${formatUnits(b, 6)}  `;
    if (b === 0n) allFunded = false;
  }
  process.stdout.write(`\r  [${new Date().toISOString().slice(11, 19)}]  ${line}`);
  if (allFunded) {
    process.stdout.write("\n✓ all wallets funded\n");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}

console.error("\n✖ timed out after 30 minutes — manual intervention needed");
process.exit(2);
