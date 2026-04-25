# Build Plan — Agent Yoink

> Bias toward shipping a tight, observable demo. We do not need a full product; we need (a) ≥50 on-chain tx, (b) ≤$0.01 per-action pricing visible, (c) two agents autonomously paying each other, (d) escrow + payout, (e) an explorer link, (f) a margin slide.

## Stack

- **Language**: TypeScript end-to-end (matches Arc tutorial; matches Circle SDK; saves time).
- **Server**: Express + `x402-express` for paywalls.
- **Indexer**: viem `watchContractEvent` against Arc RPC.
- **DB**: SQLite (good enough for demo; Postgres if Supabase is faster to wire).
- **Web**: Next.js (single page, leaderboard + tx feed + “Run demo” button).
- **Smart contracts**: **none of our own** in v1 — we reuse Arc’s deployed ERC-8183 (`0x0747EEf0706327138c69792bF28Cd525089e4583`) and the three ERC-8004 registries. (Optional v2: a `YoinkPlatformFeeHook` IACPHook implementing 1% fee to a treasury wallet, then re-deploy the platform.)
- **Wallets**: Circle Developer-Controlled Wallets, `accountType: "SCA"`, blockchain `"ARC-TESTNET"`.

## Env

```
CIRCLE_API_KEY=...
CIRCLE_ENTITY_SECRET=...
ARC_RPC_URL=https://rpc.testnet.arc.network/
USDC_ADDRESS=0x3600000000000000000000000000000000000000
ERC_8183=0x0747EEf0706327138c69792bF28Cd525089e4583
ERC_8004_IDENTITY=0x8004A818BFB912233c491871b3d84c89A494BD9e
ERC_8004_REPUTATION=0x8004B663056A597Dffe9eCcC1965A193B7388713
ERC_8004_VALIDATION=0x8004Cb1BF31DAf7788923b405b754f57acEB4272
NANOPAYMENTS_FACILITATOR_URL=...   # from Circle docs
TREASURY_WALLET_ADDRESS=...         # collects x402 fees
```

## Today (Apr 25) — what to ship for the online submission

Order matters. Each step should leave us with something demoable.

1. **Spin up Circle Developer Console** account, generate API key + Entity Secret. (10 min)
2. **`bootstrap.ts`** — create one wallet set and ~6 SCA wallets on `ARC-TESTNET`. Fund all with testnet USDC via Circle faucet. (30 min)
3. **`register-agents.ts`** — for each wallet, pin a small JSON to IPFS (or use a dummy `data:` URI) and call `IdentityRegistry.register(metadataURI)`. Capture the resulting `agentId`s by parsing `Transfer` events. (30 min)
4. **`erc8183-flow.ts`** — single bake end-to-end:
   - createJob (client → provider, evaluator=client, +1h expiry)
   - setBudget (5_000_000 = 5 USDC)
   - USDC.approve(ERC_8183, 5_000_000)
   - fund(jobId, 5_000_000, "0x")
   - submit(jobId, keccak256("hello world"), "0x")
   - complete(jobId, keccak256("looks good"), "0x")
   - assert provider USDC balance went up. (60 min)
5. **`registry-api`** — Express server with two paywalled routes via `x402-express`:
   - `GET /bakes` — $0.001
   - `POST /agents/:id/skill` — $0.005 (returns a fake LLM output)
   - Plus open routes: `POST /webhooks/event`, `GET /stats`. (60 min)
6. **Indexer** — viem `createPublicClient` + `watchContractEvent` for ERC-8183 + ERC-8004 events; persist to SQLite. (45 min)
7. **`demo-runner.ts`** — orchestrator script that:
   - registers 4 agents (4 tx)
   - loops 10x: createJob + setBudget + approve + fund + submit + complete (60 tx)
   - between submit and complete, two provider agents both call `POST /agents/:id/skill` via x402 (20 paywall tx → batched by Nanopayments)
   - mints a giveFeedback per win (10 tx)
   - prints a final tx-count summary + arcscan link.
   This is the **single command** we hit during the demo. (90 min)
8. **Next.js page** — read SQLite, render leaderboard, total tx count, total USDC moved, recent events table. (60 min)
9. **Submission write-up** — README + lablab submission form:
   - Track: Agent-to-Agent Payments (primary); X402 Monetization (secondary).
   - Demo video (Loom) of `demo-runner` running, ending on arcscan tx page.
   - Architecture diagram (the one in `04-erc-standards.md` §“How the layers combine”).
   - Margin explanation slide (numbers in `05-onchain-architecture.md` §6).
   - Detailed feedback in the form (this unlocks the $500 USDC pool — be honest, specific, structured: what worked, what was rough, what we wish existed). (45 min)

**Total ~7 hours of focused work.** Cut the Next.js page first if time pressure hits — a CLI dashboard + arcscan screenshots is enough.

## Tomorrow (Apr 26, SF) — refinement

- Tighten the demo timing (< 90s end-to-end).
- Add a 2nd category bake (research) so the leaderboard shows specialization.
- Add the optional `YoinkPlatformFeeHook` so we have a *non-zero* platform fee story (and we can collect it to the treasury wallet — adds 1 more tx visible per bake).
- Pre-record a fallback video in case live network flakes during the demo.
- Pitch script: 30s problem → 30s architecture → 30s live demo → 30s margin slide.

## Things we explicitly will NOT build

- Custom ERC-8183 contract (use Arc’s reference deploy).
- Custom L1 / appchain (Arc is the chain, period).
- Smart auctions / multi-bid resolution (single provider per bake; v2).
- Comments / chat (off-chain only, drop entirely if time).
- User-facing wallet UX (this is agent-to-agent; humans only watch).
- Cross-chain (Arc only).

## Deliverables checklist

- [ ] GitHub repo public, MIT licensed.
- [ ] README with: 1-paragraph summary, architecture diagram, run instructions (`pnpm i && pnpm bootstrap && pnpm demo`), env template, arcscan tx-list link.
- [ ] 90s demo video.
- [ ] lablab submission form filled, **detailed feedback section completed** (for the $500 pool).
- [ ] Margin explanation in README and submission.
- [ ] Live arcscan link showing ≥50 tx from our wallets.
