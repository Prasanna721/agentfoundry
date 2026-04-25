/**
 * Agent Foundry — full demo run.
 *
 * Loops N forges across two categories. For each forge:
 *   1. Creator posts a forge with a small USDC bounty.
 *   2. Codex CLI smith and Claude Code CLI smith both attempt it
 *      concurrently, each in their own subprocess.
 *   3. Creator picks one as winner (alternating round-robin).
 *
 * Tracks every transaction hash so we can publish a single arcscan
 * permalink at the end. Also reports total bounty volume and on-chain
 * tx count.
 *
 * Requires the API to be running:
 *   pkill -f "bun.*apps/api"; bun --env-file=.env apps/api/index.ts &
 *
 * Usage:
 *   bun --env-file=.env tools/demo.ts                # default: 8 forges
 *   FORGES=10 bun --env-file=.env tools/demo.ts
 */

import { spawn } from "node:child_process";

const apiBase = process.env.API_BASE ?? "http://localhost:3000";
const FORGES  = Number(process.env.FORGES ?? 8);
const BOUNTY  = process.env.BOUNTY ?? "1.00";  // $1 USDC by default — visible "real money" magnitude
const EXPIRES = Number(process.env.EXPIRES ?? 600);
const USE_JUDGE = process.env.USE_JUDGE !== "false";  // default: route winner-pick through Gemini

interface Brief { title: string; description: string; category: string }

// Real, judgeable briefs — designed to differentiate Codex vs Claude outputs.
const BRIEFS: Brief[] = [
  { title: "USDC-as-gas economics essay",
    description: "Write a 250-word essay explaining why denominating gas in USDC (instead of a volatile native token) changes the economics of AI agent marketplaces. Include one concrete numeric example. Plain prose, no headings.",
    category: "writing" },
  { title: "Postgres schema for a payment log",
    description: "Design a 3-table PostgreSQL schema for an agent payment log: agents, forges, payments. Include primary keys, foreign keys, and 2 indexes per table. Reply with ONLY the SQL DDL — no explanation.",
    category: "data" },
  { title: "TypeScript: viem listener for AgentFoundry",
    description: "Write a complete TypeScript module (~50 lines) using viem that subscribes to AgentFoundry events (ForgeCreated, Submitted, WinnerPicked) on Arc Testnet RPC https://rpc.testnet.arc.network/ and persists each event to a SQLite table called `events`. Reply with ONLY runnable code.",
    category: "code" },
  { title: "LinkedIn announcement post",
    description: "Compose a 200-word LinkedIn post announcing Agent Foundry — a USDC-settled, on-chain agent-to-agent task marketplace running on Circle's Arc L1. Professional tone. No emojis. End with a call to read the SKILL.md.",
    category: "writing" },
  { title: "ERC-8004 explainer for Solidity engineers",
    description: "Write 3 paragraphs (≈350 words total) explaining ERC-8004 to engineers who already know ERC-721 but have not heard of agent identity standards. Include the contract addresses on Arc Testnet (IdentityRegistry 0x8004A818BFB912233c491871b3d84c89A494BD9e, ReputationRegistry 0x8004B663056A597Dffe9eCcC1965A193B7388713).",
    category: "writing" },
  { title: "x402 tweet thread",
    description: "Write a 5-tweet thread explaining the x402 payment protocol. Each tweet ≤ 280 characters. Number them 1/5..5/5. No emojis. The thread should land that x402 is HTTP-native micropayments for AI agents.",
    category: "writing" },
  { title: "Why-Arc README section",
    description: "Write a complete README section titled '## Why Arc' — about 150 words plus a markdown comparison table with rows: 'tx fee per call', 'gas asset', 'finality', 'breakeven for $0.10 bounty'. Compare Arc vs Ethereum mainnet vs Solana. Reply with ONLY the markdown.",
    category: "writing" },
  { title: "JSON Schema for forge submission",
    description: "Generate a JSON Schema (draft-07) describing a forge submission object with these required fields: forgeId (string), role (enum CREATOR/SMITH_1/SMITH_2/SMITH_3/AGENT_*), deliverableURI (ipfs:// URI), deliverableHash (32-byte hex), submittedAt (ISO timestamp). Reply with ONLY the JSON.",
    category: "data" },
];

const ALL = BRIEFS.slice(0, FORGES);

interface ForgeResult {
  id: string;
  brief: Brief;
  bounty: string;
  createTx: string;
  submitCodexTx?: string;
  submitClaudeTx?: string;
  pickTx?: string;
  winner?: string;
  judgeReason?: string;
  error?: string;
}

function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  return fetch(`${apiBase}${path}`, init).then(async (r) => {
    const body = await r.json();
    if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(body)}`);
    return body as T;
  });
}

function spawnSmith(brain: "codex" | "claude", role: "SMITH_1" | "SMITH_2", forgeId: string): Promise<{ ok: boolean; txHash?: string; err?: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "bun", ["--env-file=.env", "apps/agents/smith.ts", "--brain", brain, "--role", role, "--forge", forgeId, "--api", apiBase, "--timeout", "180"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let buf = "";
    child.stdout.on("data", (d: Buffer) => { buf += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { buf += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) {
        const m = buf.match(/txHash=(0x[0-9a-f]+)/i);
        resolve({ ok: true, txHash: m?.[1] });
      } else {
        resolve({ ok: false, err: buf.split("\n").slice(-5).join("\n") });
      }
    });
  });
}

async function runForge(idx: number, brief: Brief): Promise<ForgeResult> {
  console.log(`\n━━ forge ${idx + 1}/${ALL.length}: ${brief.title} ━━`);

  const create = await api<{ id: string; txHash: string; metadataURI: string }>("/forges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "CREATOR", ...brief, bountyUSDC: BOUNTY, expiresInSec: EXPIRES }),
  });
  console.log(`  ✓ created  forge=${create.id}  tx=${create.txHash}`);

  // Run both smiths concurrently.
  const [codexR, claudeR] = await Promise.all([
    spawnSmith("codex", "SMITH_1", create.id),
    spawnSmith("claude", "SMITH_2", create.id),
  ]);
  if (!codexR.ok)  console.log(`  ✖ codex  failed: ${codexR.err?.slice(0, 200)}`);
  else             console.log(`  ✓ codex  submit  tx=${codexR.txHash}`);
  if (!claudeR.ok) console.log(`  ✖ claude failed: ${claudeR.err?.slice(0, 200)}`);
  else             console.log(`  ✓ claude submit  tx=${claudeR.txHash}`);

  // judge — Gemini decides if USE_JUDGE; otherwise alternate (legacy)
  if (!codexR.ok && !claudeR.ok) {
    return { id: create.id, brief, bounty: BOUNTY, createTx: create.txHash, submitCodexTx: codexR.txHash, submitClaudeTx: claudeR.txHash, error: "both smiths failed" };
  }

  let winner: string;
  let pickTx: string;
  let verdictReason: string | undefined;

  if (USE_JUDGE) {
    const j = await api<{ winnerRole: string; verdict: { reason: string }; txHash: string }>(`/forges/${create.id}/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "CREATOR" }),
    });
    winner = j.winnerRole;
    pickTx = j.txHash;
    verdictReason = j.verdict.reason;
    console.log(`  ✓ judge   winner=${winner}  tx=${pickTx}  reason="${(verdictReason ?? "").slice(0, 80)}…"`);
  } else {
    let pickW = idx % 2 === 0 ? "SMITH_1" : "SMITH_2";
    if (pickW === "SMITH_1" && !codexR.ok) pickW = "SMITH_2";
    if (pickW === "SMITH_2" && !claudeR.ok) pickW = "SMITH_1";
    const pick = await api<{ txHash: string }>(`/forges/${create.id}/pick-winner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "CREATOR", winnerRole: pickW, reason: `round-robin (${pickW})` }),
    });
    winner = pickW;
    pickTx = pick.txHash;
    console.log(`  ✓ pick    winner=${winner}  tx=${pickTx}`);
  }

  return {
    id: create.id, brief, bounty: BOUNTY,
    createTx: create.txHash,
    submitCodexTx: codexR.txHash, submitClaudeTx: claudeR.txHash,
    pickTx, winner: winner as any,
    judgeReason: verdictReason,
  };
}

const results: ForgeResult[] = [];
const start = Date.now();
for (let i = 0; i < ALL.length; i++) {
  try {
    results.push(await runForge(i, ALL[i]));
  } catch (e: any) {
    console.error(`✖ forge ${i + 1} failed:`, e.message);
    results.push({ id: "?", brief: ALL[i], bounty: BOUNTY, createTx: "", error: e.message });
  }
}
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

const txs = results.flatMap((r) => [r.createTx, r.submitCodexTx, r.submitClaudeTx, r.pickTx].filter(Boolean) as string[]);
const wonCount = results.filter((r) => r.winner).length;
const completedCount = results.filter((r) => !r.error).length;
const totalBounty = (Number(BOUNTY) * wonCount).toFixed(3);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`▸ run complete in ${elapsed}s`);
console.log(`  forges attempted: ${results.length}`);
console.log(`  forges completed: ${completedCount}`);
console.log(`  on-chain tx: ${txs.length}  (createForge + 2x submit + pickWinner per forge)`);
console.log(`  total USDC paid out: ${totalBounty}`);
console.log(`  contract: https://testnet.arcscan.app/address/${process.env.AGENT_FOUNDRY_CONTRACT}`);

import { writeFileSync } from "node:fs";
writeFileSync("data/demo-run.json", JSON.stringify({ startedAt: new Date(start).toISOString(), elapsed, results, txs }, null, 2));
console.log(`  artifact: data/demo-run.json (${txs.length} tx hashes)`);
