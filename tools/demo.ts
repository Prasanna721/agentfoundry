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
const BOUNTY  = process.env.BOUNTY ?? "0.10";
const EXPIRES = Number(process.env.EXPIRES ?? 600);

interface Brief { title: string; description: string; category: string }

const CODE_BRIEFS: Brief[] = [
  { title: "reverse a string",        description: "Write a one-liner TypeScript function reverse(s: string): string. Reply with ONLY the function definition.", category: "code" },
  { title: "is palindrome",           description: "Write a one-liner TypeScript function isPalindrome(s: string): boolean. Reply with ONLY the function definition.", category: "code" },
  { title: "fibonacci nth",           description: "Write a TypeScript function fib(n: number): number returning the nth Fibonacci number. Use iteration, not recursion. Reply with ONLY the function definition.", category: "code" },
  { title: "unique array",            description: "Write a TypeScript function unique<T>(xs: T[]): T[] preserving original order. Reply with ONLY the function definition.", category: "code" },
  { title: "rgb to hex",              description: "Write a TypeScript function rgbToHex(r: number, g: number, b: number): string returning a 7-char string starting with #. Reply with ONLY the function definition.", category: "code" },
];

const RESEARCH_BRIEFS: Brief[] = [
  { title: "summarize Arc",           description: "In 2-3 sentences, summarize what Circle's Arc L1 blockchain is. Reply with ONLY the summary.", category: "research" },
  { title: "summarize x402",          description: "In 2-3 sentences, summarize what the x402 payment protocol is. Reply with ONLY the summary.", category: "research" },
  { title: "summarize ERC-8004",      description: "In 2-3 sentences, summarize what ERC-8004 is. Reply with ONLY the summary.", category: "research" },
  { title: "summarize ERC-8183",      description: "In 2-3 sentences, summarize what ERC-8183 is. Reply with ONLY the summary.", category: "research" },
  { title: "summarize Nanopayments",  description: "In 2-3 sentences, summarize what Circle Nanopayments is. Reply with ONLY the summary.", category: "research" },
];

const ALL = [...CODE_BRIEFS, ...RESEARCH_BRIEFS].slice(0, FORGES);

interface ForgeResult {
  id: string;
  brief: Brief;
  bounty: string;
  createTx: string;
  submitCodexTx?: string;
  submitClaudeTx?: string;
  pickTx?: string;
  winner?: "SMITH_1" | "SMITH_2";
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

  // pick winner: alternate; if only one submitted, pick that one
  let winner: "SMITH_1" | "SMITH_2" = idx % 2 === 0 ? "SMITH_1" : "SMITH_2";
  if (winner === "SMITH_1" && !codexR.ok) winner = "SMITH_2";
  if (winner === "SMITH_2" && !claudeR.ok) winner = "SMITH_1";
  if (!codexR.ok && !claudeR.ok) {
    return { id: create.id, brief, bounty: BOUNTY, createTx: create.txHash, submitCodexTx: codexR.txHash, submitClaudeTx: claudeR.txHash, error: "both smiths failed" };
  }

  const pick = await api<{ txHash: string }>(`/forges/${create.id}/pick-winner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "CREATOR", winnerRole: winner, reason: `chosen by demo round-robin (${winner})` }),
  });
  console.log(`  ✓ pick    winner=${winner}  tx=${pick.txHash}`);

  return {
    id: create.id, brief, bounty: BOUNTY,
    createTx: create.txHash,
    submitCodexTx: codexR.txHash, submitClaudeTx: claudeR.txHash,
    pickTx: pick.txHash, winner,
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
