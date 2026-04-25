/**
 * Deploy AgentFoundry.sol to Arc Testnet via Circle's Smart Contract Platform.
 *
 * Why SCP not forge create:
 *   Circle Developer-Controlled Wallets are MPC — there is no exportable
 *   private key. SCP gives us a deploy endpoint that signs from a Circle
 *   wallet using its standard auth flow.
 *
 * Inputs:
 *   - contracts/out/AgentFoundry.sol/AgentFoundry.json (bytecode + ABI from forge build)
 *   - $WALLET_DEPLOYER       (Circle wallet ID, funded with USDC on Arc Testnet)
 *   - $USDC_ADDRESS          (constructor argument)
 *
 * Output:
 *   - prints the deployed contract address
 *   - writes AGENT_FOUNDRY_CONTRACT to .env
 *   - polls until contract is queryable; calls USDC() view to verify
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http, parseAbi } from "viem";

const ROOT     = process.cwd();
const ARTIFACT = join(ROOT, "contracts/out/AgentFoundry.sol/AgentFoundry.json");
const ENV_PATH = join(ROOT, ".env");

const apiKey       = process.env.CIRCLE_API_KEY!;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
const usdcAddr     = process.env.USDC_ADDRESS!;
const rpc          = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network/";

if (!apiKey || !entitySecret) { console.error("✖ missing CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET"); process.exit(1); }
if (!usdcAddr) { console.error("✖ USDC_ADDRESS missing"); process.exit(1); }

// --- pick a funded wallet ---------------------------------------------------
const dcw = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const walletsResp = await dcw.listWallets({ blockchain: "ARC-TESTNET" });
const wallets = walletsResp.data?.wallets ?? [];
if (wallets.length === 0) { console.error("✖ no Arc Testnet wallets in this entity"); process.exit(1); }

const pub = createPublicClient({ transport: http(rpc) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

let chosen: { id: string; address: string; balance: bigint } | null = null;
for (const w of wallets) {
  const bal = await pub.readContract({
    address: usdcAddr as `0x${string}`,
    abi: erc20,
    functionName: "balanceOf",
    args: [w.address as `0x${string}`],
  }) as bigint;
  console.log(`  wallet ${w.id}  ${w.address}  USDC=${(Number(bal) / 1e6).toFixed(2)}`);
  if (bal > 0n && (!chosen || bal > chosen.balance)) {
    chosen = { id: w.id!, address: w.address!, balance: bal };
  }
}
if (!chosen) { console.error("✖ no Arc Testnet wallet has USDC. Run faucet.ts first."); process.exit(1); }
console.log(`▸ deploying from wallet ${chosen.id} (${chosen.address}, ${(Number(chosen.balance) / 1e6).toFixed(2)} USDC)`);

// --- read forge artifact ----------------------------------------------------
if (!existsSync(ARTIFACT)) { console.error("✖ build the contract first: cd contracts && forge build"); process.exit(1); }
const art = JSON.parse(readFileSync(ARTIFACT, "utf8"));
const bytecode: string = art.bytecode?.object || art.bytecode;
const abi = art.abi;
if (!bytecode || !abi) { console.error("✖ artifact missing bytecode or abi"); process.exit(1); }
console.log(`▸ AgentFoundry bytecode = ${bytecode.length} chars, abi = ${abi.length} entries`);

// --- deploy via SCP ---------------------------------------------------------
const scp = initiateSmartContractPlatformClient({ apiKey, entitySecret });
const dep = await scp.deployContract({
  name: "AgentFoundry",
  description: "Multi-bidder USDC escrow for Agent Foundry on Arc Testnet",
  walletId: chosen.id,
  blockchain: "ARC-TESTNET" as any,
  abiJson: typeof abi === "string" ? abi : JSON.stringify(abi),
  bytecode,
  constructorParameters: [usdcAddr],
  feeLevel: "MEDIUM" as any,
});

const txId = dep.data?.transactionId ?? dep.data?.id;
const contractIdResp = (dep.data as any)?.contractId;
console.log(`▸ deploy queued. transactionId=${txId}  contractId=${contractIdResp}`);

if (!txId) { console.error("✖ no transactionId in deploy response"); console.error(JSON.stringify(dep.data, null, 2)); process.exit(1); }

// --- poll the tx until confirmed --------------------------------------------
let address: string | undefined;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const tx = await dcw.getTransaction({ id: txId });
  const t = tx.data?.transaction;
  process.stdout.write(`\r  [${new Date().toISOString().slice(11, 19)}] tx ${t?.state ?? "?"}  ${t?.txHash?.slice(0, 14) ?? ""}…    `);
  if (t?.state === "CONFIRMED" || t?.state === "COMPLETE") {
    address = (t as any).contractAddress;
    if (!address && contractIdResp) {
      const c = await scp.getContract({ id: contractIdResp });
      address = (c.data as any)?.contract?.contractAddress;
    }
    process.stdout.write("\n");
    break;
  }
  if (t?.state === "FAILED" || t?.state === "CANCELED" || t?.state === "DENIED") {
    process.stdout.write("\n");
    console.error("✖ deploy tx failed:", JSON.stringify(t));
    process.exit(1);
  }
}
if (!address) { console.error("✖ no contract address resolved within 3min"); process.exit(1); }
console.log(`✓ AgentFoundry deployed at ${address}`);
console.log(`  explorer: https://testnet.arcscan.app/address/${address}`);

// --- persist into .env ------------------------------------------------------
let env = readFileSync(ENV_PATH, "utf8");
const line = `AGENT_FOUNDRY_CONTRACT=${address}`;
if (/^AGENT_FOUNDRY_CONTRACT=/m.test(env)) {
  env = env.replace(/^AGENT_FOUNDRY_CONTRACT=.*$/m, line);
} else {
  env = env.replace(/^YOINK_CONTRACT=.*$/m, line);
  if (!env.includes("AGENT_FOUNDRY_CONTRACT=")) env += `\n${line}\n`;
}
writeFileSync(ENV_PATH, env);
console.log(`▸ wrote AGENT_FOUNDRY_CONTRACT to .env`);

// --- real validation: cast a view call --------------------------------------
const usdcView = parseAbi(["function USDC() view returns (address)"]);
const got = await pub.readContract({
  address: address as `0x${string}`,
  abi: usdcView,
  functionName: "USDC",
}) as `0x${string}`;
console.log(`▸ AgentFoundry.USDC() = ${got}`);
if (got.toLowerCase() !== usdcAddr.toLowerCase()) {
  console.error("✖ USDC() does not match expected address!");
  process.exit(1);
}
console.log("✓ deployment validated end-to-end");
