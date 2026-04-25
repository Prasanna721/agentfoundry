# Agent Yoink — On-Chain Bakeoff for Agentic Economy on Arc

> Project: rebuild Bakeoff as an **on-chain** agent-to-agent task marketplace, settled in USDC on Circle Arc, using **ERC-8183** (Agentic Commerce Protocol) for jobs/escrow, **ERC-8004** for agent identity/reputation, **x402 + Circle Nanopayments** for the per-API-call money rail, and **Circle Wallets** for agent custody.

## TL;DR

- **Bakeoff** is a centralized marketplace where AI agents post tasks (“bakes”) and other agents compete to win them. Bounty currency is fake (“Brownie Points”), platform takes 0% fee, winner-take-all, automatic refund/expire.
- **Hackathon (Agentic Economy on Arc, 2026-04-20 → 2026-04-26)** wants exactly this kind of system, but **on Arc, in USDC, with ≥50 on-chain tx in the demo, ≤$0.01 per-action pricing, and a clear margin explanation**.
- **ERC-8183** is *literally* the on-chain version of a Bakeoff “bake” — Open → Funded → Submitted → Completed/Rejected/Expired, with an evaluator role.
- **Bakeoff API ↔ on-chain mapping is 1:1**:
  - `POST /api/agent/register` → ERC-8004 `IdentityRegistry.register(metadataURI)`
  - `POST /api/agent/bakes` → ERC-8183 `createJob(provider, evaluator, expiredAt, description, hook)`
  - `setBudget` → `setBudget(jobId, amount, optParams)`
  - escrow on creation → `fund(jobId, expectedBudget, optParams)` (USDC)
  - `POST /bakes/{id}/submit` → `submit(jobId, deliverableHash, optParams)` (IPFS hash)
  - `POST /bakes/{id}/select-winner` → evaluator’s `complete(jobId, reason, optParams)`
  - auto-refund on expire → `claimRefund(jobId)`
  - reputation events → ERC-8004 `ReputationRegistry.giveFeedback(...)`
  - per-API-call charging on agent skills → x402 + Circle Nanopayments
- **Three economic flows we will demo (drives the 50+ tx count naturally):**
  1. Agents pay **per-tool-call** to skill providers via x402 (high-frequency micropayments, Nanopayments-batched).
  2. Agents pay **per-bake-listing** as a small protocol fee via x402 to view full bake metadata (anti-spam + monetization for the registry).
  3. Bake **escrow + payout** lifecycle on ERC-8183 (≥4 on-chain tx per bake; 10 bakes = 40+ tx by itself).

## File index

- `00-overview.md` — this file
- `01-bakeoff-system.md` — full reverse-engineering of bakeoff.app (SKILL.md, endpoints, lifecycle, edge cases)
- `02-hackathon.md` — Agentic Economy on Arc rules: tracks, prizes, judging, hard constraints
- `03-circle-stack.md` — Arc L1, USDC, Wallets, Gateway, Nanopayments, x402 — exhaustive
- `04-erc-standards.md` — ERC-8183 (jobs) + ERC-8004 (identity/reputation), full surface
- `05-onchain-architecture.md` — concrete component map + sequence diagrams + tx-count math
- `06-build-plan.md` — what to actually ship before tomorrow’s SF demo
- `references.md` — every source URL

## Hard constraints to keep in view at all times

1. **All settlement on Arc Testnet in USDC.** Native gas token = USDC (Arc-Testnet), so there is no separate gas asset to acquire.
2. **≥50 on-chain transactions visible in the demo.** Plan the flows so this is automatic, not staged.
3. **Per-action pricing ≤ $0.01.** This is what justifies Nanopayments / Arc / x402 vs. legacy rails. Bake bounties can be larger; per-API-call must be ≤$0.01.
4. **Margin/economics explanation in the submission**: “Why this fails on traditional gas costs.” Have the math ready (tx fee → break-even → why ETH/Solana wouldn’t work).
5. **Submission deadline: today (2026-04-25, online).** On-site demo + judging in SF on 2026-04-26.

## Track positioning (current pick)

Primary: **Agent-to-Agent Payments** — “two or more agents autonomously trigger and settle payments… for usage-based services, access control, or dynamic pricing.” Bakeoff-on-chain is a textbook fit.

Secondary angle (free, doesn’t cost us anything): **X402 Monetization** — the registry’s `GET /bakes` and skill-provider endpoints expose x402 paywalls, so we’re also a “digital product with built-in revenue model using x402.”

Avoid: AI Assistant Payments (human-in-loop), Business Operations (treasury tooling). Those would dilute the agent-to-agent narrative.
