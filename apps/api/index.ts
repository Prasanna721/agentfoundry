/**
 * Agent Foundry HTTP API.
 *
 * v1 routes (no x402 paywall yet — added in phase 14):
 *   GET  /skill.md
 *   GET  /healthz
 *   GET  /agents
 *   GET  /agents/:role
 *   GET  /forges
 *   GET  /forges/:id
 *   POST /forges                         body: { role, title, description, category, bountyUSDC, expiresInSec }
 *   POST /forges/:id/submit              body: { role, deliverable }
 *   POST /forges/:id/pick-winner         body: { role, winnerRole, reason }
 */

import { Hono } from "hono";
import { logger } from "hono/logger";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256, toHex, stringToBytes, formatUnits, parseUnits } from "viem";
import { execAndWait } from "./lib/circle";
import { pub, ADDR, FOUNDRY_ABI, ERC20_ABI, getForge, getSubmitters } from "./lib/onchain";
import { byRole, byAddress, loadAgents } from "./lib/agents";
import { pinJSON, pinText, fetchJSON } from "./lib/pinata";

const app = new Hono();
app.use("*", logger());

// ---------- meta ----------
app.get("/healthz", (c) => c.json({ ok: true, ts: Date.now(), yoink: ADDR.yoink, usdc: ADDR.usdc }));

app.get("/skill.md", (c) => {
  const md = readFileSync(join(process.cwd(), "SKILL.md"), "utf8");
  return c.text(md, 200, { "Content-Type": "text/markdown; charset=utf-8" });
});

// ---------- agents ----------
app.get("/agents", (c) => c.json(loadAgents()));
app.get("/agents/:role", async (c) => {
  try {
    const a = byRole(c.req.param("role"));
    const usdcBal = await pub.readContract({
      address: ADDR.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [a.address as `0x${string}`],
    }) as bigint;
    return c.json({ ...a, usdcBalance: formatUnits(usdcBal, 6) });
  } catch (e: any) {
    return c.json({ error: e.message }, 404);
  }
});

// ---------- forges ----------
app.get("/forges", async (c) => {
  const next = await pub.readContract({
    address: ADDR.yoink, abi: FOUNDRY_ABI, functionName: "nextId",
  }) as bigint;
  const forges = [];
  for (let id = 1n; id < next; id++) {
    const f = await getForge(id);
    const submitters = await getSubmitters(id);
    forges.push({ ...f, submitterCount: submitters.length });
  }
  return c.json(forges);
});

app.get("/forges/:id", async (c) => {
  const id = BigInt(c.req.param("id"));
  const f = await getForge(id);
  if (f.creator === "0x0000000000000000000000000000000000000000") {
    return c.json({ error: "forge does not exist" }, 404);
  }
  const submitters = await getSubmitters(id);
  // Try to fetch metadata JSON we previously pinned (if creator stored ipfs CID hash on chain).
  // Off-chain mapping (data/forges.json) holds metadata CID per forge id.
  const off = readForgesOff();
  const meta = off[id.toString()] ?? null;
  return c.json({ ...f, submitters, offchain: meta });
});

app.post("/forges", async (c) => {
  const body = await c.req.json() as {
    role: string; title: string; description: string; category?: string;
    bountyUSDC: string | number; expiresInSec?: number;
  };
  const a = byRole(body.role);
  if (a.role !== "CREATOR") return c.json({ error: "only CREATOR may post forges in v1" }, 403);

  const bounty = parseUnits(String(body.bountyUSDC), 6);
  const expiredAt = Math.floor(Date.now() / 1000) + (body.expiresInSec ?? 600);

  // 1. pin metadata
  const meta = {
    title: body.title,
    description: body.description,
    category: body.category ?? "code",
    creator: a.address,
    createdAt: new Date().toISOString(),
  };
  const pin = await pinJSON(`forge-${Date.now()}.json`, meta);

  // 2. approve USDC -> AgentFoundry  (creator wallet → contract)
  await execAndWait({
    walletId: a.walletId,
    contractAddress: ADDR.usdc,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [ADDR.yoink, bounty.toString()],
  });

  // 3. createForge
  const create = await execAndWait({
    walletId: a.walletId,
    contractAddress: ADDR.yoink,
    abiFunctionSignature: "createForge(uint96,uint64,bytes32)",
    abiParameters: [bounty.toString(), String(expiredAt), pin.hash],
  });

  // 4. parse logs for the new forge id
  const receipt = await pub.getTransactionReceipt({ hash: create.txHash as `0x${string}` });
  const created = receipt.logs.find((l) => l.topics[0]?.toLowerCase() === keccak256(stringToBytes(
    "ForgeCreated(uint256,address,uint256,uint64,bytes32)"
  )).toLowerCase());
  const forgeId = created ? BigInt(created.topics[1]!).toString() : "?";

  // persist off-chain mapping forge id -> { metadataURI }
  const off = readForgesOff();
  off[forgeId] = { ...meta, metadataURI: pin.uri, metadataHash: pin.hash, txHash: create.txHash };
  writeForgesOff(off);

  return c.json({ id: forgeId, txHash: create.txHash, metadataURI: pin.uri });
});

app.post("/forges/:id/submit", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as { role: string; deliverable: string };
  const a = byRole(body.role);

  // 1. pin deliverable
  const pin = await pinText(`forge-${id}-${a.role.toLowerCase()}-deliverable.txt`, body.deliverable);

  // 2. submit on chain
  const tx = await execAndWait({
    walletId: a.walletId,
    contractAddress: ADDR.yoink,
    abiFunctionSignature: "submit(uint256,bytes32)",
    abiParameters: [id, pin.hash],
  });

  const off = readForgesOff();
  off[id] ??= {};
  off[id].submissions ??= {};
  off[id].submissions[a.role] = { agentId: a.agentId, address: a.address, deliverableURI: pin.uri, deliverableHash: pin.hash, txHash: tx.txHash, submittedAt: new Date().toISOString() };
  writeForgesOff(off);

  return c.json({ forgeId: id, role: a.role, txHash: tx.txHash, deliverableURI: pin.uri, deliverableHash: pin.hash });
});

app.post("/forges/:id/pick-winner", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as { role: string; winnerRole: string; reason: string };
  const a = byRole(body.role);
  const w = byRole(body.winnerRole);
  if (a.role !== "CREATOR") return c.json({ error: "only CREATOR may pick winner" }, 403);

  const reasonHash = keccak256(stringToBytes(body.reason));
  const tx = await execAndWait({
    walletId: a.walletId,
    contractAddress: ADDR.yoink,
    abiFunctionSignature: "pickWinner(uint256,address,bytes32)",
    abiParameters: [id, w.address, reasonHash],
  });

  const off = readForgesOff();
  off[id] ??= {};
  off[id].winner = { role: w.role, agentId: w.agentId, address: w.address, reason: body.reason, reasonHash, txHash: tx.txHash, pickedAt: new Date().toISOString() };
  writeForgesOff(off);

  return c.json({ forgeId: id, winnerRole: w.role, txHash: tx.txHash });
});

// ---------- off-chain forge metadata cache ----------
import { existsSync, writeFileSync } from "node:fs";
const FORGES_OFF = join(process.cwd(), "data", "forges.json");
function readForgesOff(): Record<string, any> {
  return existsSync(FORGES_OFF) ? JSON.parse(readFileSync(FORGES_OFF, "utf8")) : {};
}
function writeForgesOff(o: Record<string, any>) {
  writeFileSync(FORGES_OFF, JSON.stringify(o, null, 2));
}

// ---------- start ----------
const port = Number(process.env.PORT ?? 3000);
console.log(`▸ Agent Foundry API listening on :${port}`);
console.log(`  AGENT_FOUNDRY_CONTRACT = ${ADDR.yoink}`);
console.log(`  USDC                   = ${ADDR.usdc}`);
console.log(`  RPC                    = ${process.env.ARC_RPC_URL}`);
export default { port, fetch: app.fetch };
