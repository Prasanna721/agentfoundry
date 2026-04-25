/**
 * Send USDC from a Circle wallet to a fresh local EOA so we can deploy
 * AgentFoundry with `forge create`.
 *
 * Inputs (env):
 *   CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET — Circle auth
 *   USDC_ADDRESS                          — USDC contract on Arc Testnet
 *   ARC_RPC_URL                           — Arc Testnet RPC
 *   DEPLOYER_ADDRESS                      — fresh EOA (from `cast wallet new`)
 *   DEPLOYER_FUND_USDC                    — amount to send (USDC, integer; default 5)
 *
 * Picks the Circle wallet with the largest USDC balance, calls
 * USDC.transfer(DEPLOYER_ADDRESS, amount * 1e6), waits for confirmation.
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";

const apiKey       = process.env.CIRCLE_API_KEY!;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
const usdc         = process.env.USDC_ADDRESS!;
const rpc          = process.env.ARC_RPC_URL!;
const deployer     = process.env.DEPLOYER_ADDRESS as `0x${string}`;
const amount       = BigInt(process.env.DEPLOYER_FUND_USDC || "5") * 1_000_000n;  // 6 decimals

if (!apiKey || !entitySecret || !usdc || !rpc || !deployer) {
  console.error("✖ missing env. Need CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, USDC_ADDRESS, ARC_RPC_URL, DEPLOYER_ADDRESS");
  process.exit(1);
}

const dcw = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const pub = createPublicClient({ transport: http(rpc) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const wallets = (await dcw.listWallets({ blockchain: "ARC-TESTNET" })).data?.wallets ?? [];
let chosen: { id: string; address: string; balance: bigint } | null = null;
for (const w of wallets) {
  const b = await pub.readContract({ address: usdc as `0x${string}`, abi: erc20, functionName: "balanceOf", args: [w.address as `0x${string}`] }) as bigint;
  if (b > 0n && (!chosen || b > chosen.balance)) chosen = { id: w.id!, address: w.address!, balance: b };
}
if (!chosen) { console.error("✖ no funded Circle wallet"); process.exit(1); }
console.log(`▸ funding ${deployer} with ${formatUnits(amount, 6)} USDC from Circle wallet ${chosen.address} (balance ${formatUnits(chosen.balance, 6)})`);

const tx = await dcw.createContractExecutionTransaction({
  walletId: chosen.id,
  contractAddress: usdc,
  abiFunctionSignature: "transfer(address,uint256)",
  abiParameters: [deployer, amount.toString()],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
const txId = tx.data?.id;
console.log(`▸ transaction queued: ${txId}`);

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2500));
  const t = (await dcw.getTransaction({ id: txId! })).data?.transaction;
  process.stdout.write(`\r  [${new Date().toISOString().slice(11, 19)}] ${t?.state ?? "?"}  ${t?.txHash?.slice(0, 14) ?? ""}…   `);
  if (t?.state === "CONFIRMED" || t?.state === "COMPLETE") {
    process.stdout.write(`\n  txHash: ${t.txHash}\n`);
    break;
  }
  if (t?.state === "FAILED" || t?.state === "DENIED" || t?.state === "CANCELED") {
    console.error("\n✖ tx failed:", JSON.stringify(t));
    process.exit(1);
  }
}

const after = await pub.readContract({ address: usdc as `0x${string}`, abi: erc20, functionName: "balanceOf", args: [deployer] }) as bigint;
console.log(`✓ deployer ${deployer} now holds ${formatUnits(after, 6)} USDC`);
if (after === 0n) { console.error("✖ deployer balance still 0; tx may not have settled"); process.exit(1); }
