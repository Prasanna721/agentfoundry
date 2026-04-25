# Agent Yoink — On-Chain Architecture (Bakeoff → Arc)

## 1. Concept map (Bakeoff → on-chain)

| Bakeoff concept | On-chain equivalent |
|---|---|
| Agent registration (`POST /api/agent/register`) | `IdentityRegistry.register(metadataURI)` (ERC-8004) → mints NFT, returns `agentId`. |
| API key | EIP-712 signed message from agent’s wallet (no static key; wallet signs every action). |
| BP balance (1000 BP at signup) | USDC balance in agent’s Circle Wallet on Arc. Faucet drip = the signup grant. |
| Brownie Points | **USDC** (real money, even if testnet). |
| Bake (`POST /bakes`) | `ERC8183.createJob(provider=0, evaluator=client, expiredAt, description, hook=0)`. |
| Bake budget | `ERC8183.setBudget(jobId, amount, "")` (caller: client or provider). |
| Escrow on bake creation | `USDC.approve(ERC8183, amount)` + `ERC8183.fund(jobId, expectedBudget, "")`. |
| `accept` | (off-chain only — informational; or write a `ProviderSet` if we want it on-chain). |
| `submit` | `ERC8183.submit(jobId, ipfsCidHash, "")`. |
| `select-winner` | `ERC8183.complete(jobId, reasonHash, "")` (evaluator). |
| Cancel (no submissions) | `ERC8183.reject(jobId, reasonHash, "")` while Open (client). |
| Auto-refund on expiry | `ERC8183.claimRefund(jobId)` — anyone can call after `expiredAt`; we run a cron worker. |
| Comments | Off-chain (Postgres/Supabase) — no need to put chat on-chain. |
| Submission types (GitHub URL, ZIP, deployed URL, PR, plaintext) | All collapse to a `bytes32 deliverable` = keccak256 of an IPFS-pinned envelope JSON. |
| Categories | Tag in IPFS metadata; index off-chain. |
| Rate limits | Enforce at API gateway; on-chain protected naturally by gas + nonce. |
| Win/loss stats | Index `JobCompleted` / `JobRejected` events; mirror to ERC-8004 `giveFeedback`. |

## 2. Two payment rails (the architectural insight)

| Rail | Use | Trigger | Tooling |
|---|---|---|---|
| **x402 + Circle Nanopayments** | Per-call charging on the registry & per-skill-call between agents (sub-cent). | Synchronous HTTP request. | `x402-express` middleware, Circle Nanopayments facilitator on Arc. |
| **ERC-8183 escrow** | Bake bounty lifecycle (cents → dollars). | Multi-step async (create / fund / submit / complete). | `@circle-fin/developer-controlled-wallets` calling Arc RPC. |

If a judge asks “why two rails?” the answer is: **x402 is for reads, 8183 is for outcomes**. Both are needed; using only one gives you either a no-escrow paywall OR a slow synchronous workflow.

## 3. Components

```
yoink/
├─ contracts/                    (we DON’T deploy 8183 — use Arc’s reference deploy)
│  └─ YoinkPlatformFeeHook.sol   (optional IACPHook — 1% fee to treasury)
├─ apps/
│  ├─ registry-api/              Express + x402-express + Postgres
│  │   • routes: /agents, /bakes (paywalled reads), /webhooks
│  │   • indexer worker: subscribes to Arc RPC for JobCreated / JobFunded /
│  │     JobSubmitted / JobCompleted / JobRejected / JobExpired events
│  │   • expiry worker: cron, calls claimRefund on overdue jobs
│  │   • reputation worker: on JobCompleted → giveFeedback(winner, 100)
│  ├─ web/                       Next.js leaderboard / bake feed (read-only)
│  │   • shows live tx count + USDC volume
│  │   • shows agent stats / reputation
│  └─ agents/                    A handful of demo agents (CLI / scripts)
│       • code-bot   (provides "write a contract" skill via x402)
│       • research-bot (provides "summarize URL" skill via x402)
│       • orchestrator (creates bakes, picks winners — runs the show in demo)
└─ scripts/
   ├─ bootstrap.ts               creates wallet sets, faucets USDC, registers all agents
   ├─ seed-bakes.ts              loops 10x: createJob → setBudget → approve → fund
   └─ demo-runner.ts             one-button demo that drives the 50+ tx flow
```

## 4. Tx-count budget (target ≥ 50)

| Action | tx | count | total |
|---|---|---|---|
| Register agents (ERC-8004) | 1 | 5 agents | 5 |
| Create bake (createJob) | 1 | 10 bakes | 10 |
| setBudget | 1 | 10 bakes | 10 |
| approve USDC → ERC-8183 | 1 | 10 bakes | 10 |
| fund | 1 | 10 bakes | 10 |
| submit | 1 | 10 bakes | 10 |
| complete (or reject + claimRefund) | 1–2 | 10 bakes | 10–15 |
| ReputationRegistry.giveFeedback | 1 | 10 wins | 10 |
| Nanopayments batch settlement events | (batched) | several | +5–20 |
| **Total visible on-chain tx** |  |  | **~75–95** |

We blow past 50. Plus *off-chain* Nanopayments calls show up as a giant volume number in our dashboard (we want to show e.g. “500 sub-cent x402 calls aggregated into 3 on-chain settlement tx”).

## 5. End-to-end demo sequence (60–90 sec)

1. Click **“Run demo”** in the web UI.
2. Orchestrator agent registers 4 freshly-minted Circle Wallets as ERC-8004 agents (5 tx).
3. Orchestrator creates 10 bakes via `createJob` (10 tx).
4. For each bake: setBudget → approve → fund (30 tx). Bounties shown in USDC.
5. Two skill-provider agents (code-bot, research-bot) each compete on every bake; **before submitting, the orchestrator agent calls each provider’s skill via x402** (10 × 2 = 20 sub-cent x402 calls hitting Nanopayments). The actual deliverable is the bytes32 hash of the model output pinned to IPFS.
6. Each winning provider calls `submit` (10 tx).
7. Orchestrator (acting as evaluator) calls `complete` on 9 of them, `reject` on 1 (10 tx), then `claimRefund` on the rejected one after a forced 30s expiry (1 tx).
8. ReputationRegistry: feedback events for each completion (9 tx).
9. Live counter on UI shows total on-chain tx and total USDC settled. Show an `arcscan.app` link.

Result: **~75 on-chain tx + 20+ Nanopayments**, ≤$0.01 per skill call, ≤$1 per bake bounty.

## 6. Margin / economics talking points (for the writeup)

- **Per-skill-call cost on Arc**: ~$0.006 settlement amortized over Nanopayments batches → effectively **fractions of a cent**. On Ethereum mainnet at typical 10 gwei × $3000 ETH, the same call would cost > $0.20 — 30× our entire price point.
- **Bake escrow lifecycle**: 4–6 tx per bake. On Arc that’s ~$0.025–$0.04 in fees. On Ethereum L1, > $1 per bake — kills sub-$1 bake economies entirely.
- **No volatile gas asset**: USDC-as-gas means a $0.005 budget line stays a $0.005 budget line. Pricing models can be deterministic, which is *required* for autonomous agents bound by spending limits.

## 7. Risks / mitigations

| Risk | Mitigation |
|---|---|
| Circle Wallets DCW rate-limits during demo | Pre-fund all wallets in `bootstrap.ts`; don’t create wallets live during demo. |
| Arc RPC flakes | Cache last successful tx hash; show explorer links rather than RPC-bound counters. |
| x402 facilitator latency | Pick Circle’s Nanopayments facilitator on Arc, not Coinbase CDP (which doesn’t list Arc). |
| Evaluator collusion accusation from a judge | Mention ERC-8004 + that evaluator can be split (DAO/oracle); we keep creator=evaluator for the demo simplicity. |
| Submission deadline | Frontload the hackathon submission write-up *now*; iterate the demo until SF day. |
