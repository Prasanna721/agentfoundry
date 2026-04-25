/**
 * Generic "smith" agent runner.
 *
 * Given a forge id and a brain (codex|claude), this:
 *   1. Reads our SKILL.md to understand the platform.
 *   2. GET /forges/:id to load the brief.
 *   3. Spawns the chosen brain CLI as a subprocess with a minimal prompt
 *      that contains the brief (no platform tools — the brain is purely
 *      a problem-solver in this loop).
 *   4. Captures the brain's final output text.
 *   5. POST /forges/:id/submit  with that text as the deliverable.
 *
 * Real validation: the deliverable hash on chain matches keccak256 of the
 * IPFS CID; the brain's output is a coherent solution to the brief.
 *
 * Usage:
 *   bun apps/agents/smith.ts --brain codex  --role SMITH_1 --forge <id>
 *   bun apps/agents/smith.ts --brain claude --role SMITH_2 --forge <id>
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const brain = (args.brain ?? "codex") as "codex" | "claude";
const role  = args.role ?? (brain === "codex" ? "SMITH_1" : "SMITH_2");
const forgeId = args.forge;
const apiBase = args.api ?? "http://localhost:3000";
const timeoutSec = Number(args.timeout ?? 240);

if (!forgeId) {
  console.error("usage: bun apps/agents/smith.ts --brain <codex|claude> --role SMITH_X --forge <id>");
  process.exit(2);
}

// 1. Read the forge brief.
const forge = await (await fetch(`${apiBase}/forges/${forgeId}`)).json();
if (!forge || forge.error) { console.error("forge not found:", forge); process.exit(1); }
const meta = forge.offchain ?? {};
const title = meta.title ?? `Forge #${forgeId}`;
const description = meta.description ?? "(no description on chain)";
const category = meta.category ?? "code";

console.log(`▸ smith[${role}] brain=${brain} forge=${forgeId}`);
console.log(`  title: ${title}`);
console.log(`  category: ${category}`);
console.log(`  description: ${description}`);

// 2. Build the prompt for the brain.
const prompt = [
  `You are an autonomous "smith" on Agent Foundry, an on-chain task marketplace on Arc Testnet.`,
  `You have been awarded one forge brief. Solve it and reply with ONLY the solution. No preamble, no commentary, no explanation. Just the deliverable text.`,
  ``,
  `Brief — ${title}`,
  `Category: ${category}`,
  `Description:`,
  description,
  ``,
  `Reply now with the deliverable.`,
].join("\n");

// 3. Spawn the brain.
const dir = mkdtempSync(join(tmpdir(), `forge-${forgeId}-${role.toLowerCase()}-`));
const outputFile = join(dir, "answer.txt");

const cmd = brain === "codex"
  ? "codex"
  : "claude";

const cmdArgs = brain === "codex"
  ? [
      "exec",
      "--skip-git-repo-check",
      "--color", "never",
      "--output-last-message", outputFile,
      "-s", "read-only",
      "--dangerously-bypass-approvals-and-sandbox",
      prompt,
    ]
  : [
      "--print",                                      // non-interactive
      "--output-format", "text",
      "--permission-mode", "bypassPermissions",
      prompt,
    ];

console.log(`▸ spawning: ${cmd} ${cmdArgs.slice(0, 3).join(" ")} … (${cmdArgs.length} args)`);

const start = Date.now();
const buffered: string[] = [];
const child = spawn(cmd, cmdArgs, { stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (d: Buffer) => { const s = d.toString(); buffered.push(s); process.stdout.write(s); });
child.stderr.on("data", (d: Buffer) => { process.stderr.write(d); });

const exitCode: number = await new Promise((res, rej) => {
  const t = setTimeout(() => { child.kill("SIGKILL"); rej(new Error(`brain timeout after ${timeoutSec}s`)); }, timeoutSec * 1000);
  child.on("close", (c) => { clearTimeout(t); res(c ?? -1); });
});
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n▸ brain exited ${exitCode} after ${elapsed}s`);

// 4. Capture the deliverable.
let deliverable = "";
try {
  // codex --output-last-message writes to file; claude doesn't but stdout is the answer.
  deliverable = readFileSync(outputFile, "utf8").trim();
} catch (_) {
  // fallback to stdout for claude path
  deliverable = buffered.join("").trim();
}
if (!deliverable) { console.error("✖ brain produced no output"); process.exit(1); }
console.log(`▸ deliverable (${deliverable.length} chars):\n${deliverable.slice(0, 400)}${deliverable.length > 400 ? "…" : ""}`);

// 5. Submit.
const r = await fetch(`${apiBase}/forges/${forgeId}/submit`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role, deliverable }),
});
const body = await r.json();
if (!r.ok) { console.error("✖ submit failed:", r.status, body); process.exit(1); }
console.log(`✓ submitted. txHash=${body.txHash}  cid=${body.deliverableURI}`);

// helpers
function parseArgs(argv: string[]) {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1];
      o[k] = v;
      i++;
    }
  }
  return o;
}
