# Hackathon — Agentic Economy on Arc (Nano Payments / Arc)

Sources: `https://lablab.ai/ai-hackathons/nano-payments-arc`, `https://lablab.ai/event/agentic-commerce-on-arc` (sister/predecessor event), competehub mirror, Arc community blog. lablab.ai pages 403 to crawlers — info compiled from search snippets and community write-ups.

## Dates (2026)

| Phase | Date |
|---|---|
| Online build & submission | **Apr 20 – Apr 25** (submit by 2026-04-25) |
| On-site build day (SF, CA) | **Apr 25** |
| On-site demos & awards (SF, CA) | **Apr 26** |

Today (2026-04-25) is **submission deadline** for online and the in-person refine day.

## Sponsors / partners

- **Arc** (Circle’s stablecoin-native L1)
- **Circle** (USDC issuer; Wallets, Gateway, Nanopayments, Smart Contract Platform)
- **Lablab.ai** (host)
- Adjacent ecosystem: Coinbase x402, AI/ML API, Featherless (optional model providers)

## Prizes

- 🥇 1st: **$3,000 cash** + 1000 Man-Hour credits ($1,500 value)
- 🥈 2nd: **$2,000 cash** + 500 Man-Hour credits ($750 value)
- 🥉 3rd: **$1,000 cash** + 300 Man-Hour credits ($450 value)
- **+$500 USDC pool** for teams that give the most helpful detailed feedback in the submission form.

## Tracks (pick exactly one for primary; secondary themes okay in writeup)

1. **Agent-to-Agent Payments** ← *our primary fit*
   > Two or more agents autonomously trigger and settle payments — usage-based services, access control, dynamic pricing. Minimal human input.

2. **AI Assistant Payments**
   > AI assistant pays on a user’s behalf with rules: spending limits, approval checkpoints. (human-in-loop)

3. **Business Operations**
   > Tool for businesses to manage real-time payments and financial operations.

4. **X402 Monetization** ← *our secondary angle, free to claim*
   > Launch a digital product/service with built-in revenue using x402 (token-gated access, instant payouts).

## Submission requirements (hard rules)

- Working **demo**.
- Clear explanation of the use case.
- Detailed feedback in the submission form (this is what unlocks the $500 USDC pool — write it well).
- **Real per-action pricing ≤ $0.01.**
- **Show transaction-frequency data**: at least **50+ on-chain transactions** observable in the demo.
- **Margin / economics explanation**: explicitly justify why this model would fail under traditional gas costs (i.e. the model is only viable on Arc + Nanopayments / x402).

## Required tech

- **Arc** (testnet for the build; settlement on Arc).
- **USDC** as currency *and* gas token.
- **x402** for HTTP-native per-call payments.
- **Circle Nanopayments** for high-frequency / sub-cent pay-per-use.
- **Circle Developer Console** account + API key + Entity Secret.

## Recommended tech (any subset)

- **Circle Wallets** (developer-controlled or user-controlled; SCA recommended).
- **Circle Gateway** (chain-abstracted USDC balance; underpins Nanopayments).
- **Circle Smart Contract Platform** (deploy / interact with custom contracts via REST).
- **Featherless / AI-ML API** for model inference.
- LangChain / Vercel AI SDK / Claude MCP / Google GenAI — any agent framework is fine.

## Judging signals (compiled from sponsor priorities and prior-event write-ups)

- **Economic legitimacy**: real money flowing, not just demo screenshots. Show the explorer.
- **Per-call pricing**: ≤$0.01 actually charged per action in the demo run.
- **Volume**: ≥50 tx visible.
- **x402 + Nanopayments depth**: not just paying once, but using the right tool (x402 sync micropayments / Nanopayments batched gasless / ERC-8183 escrow) for the right job.
- **Agent autonomy**: agents pay each other without human intervention beyond start.
- **Margin story**: a legible “this could not exist on Ethereum mainnet at $X gas” narrative.

## What other teams shipped (reference bar from the Jan 2026 sister event)

- **Arc Merchant** — paywalled-content x402 reference toolkit; adapters for Claude MCP, Vercel AI SDK, Google GenAI; agent receives 402, signs USDC via Circle Wallets, retries, gets content. No popups.
- **Agent Router** — LLM-routing service charging per-request in USDC on Arc; cost-plus margins, sub-cent pricing.
- **Agentic Economy on Arc (AEA)**, **PayLink Agents**, **Agentic E-Commerce**, **KAI / Agentic RFQ**, **PAIgent**, **DeMemo** — all sister-event teams; titles indicate the standard “marketplace + autonomous payments” theme is heavily explored. We need a sharp wedge.

## Our wedge vs the field

- Most submissions are **payment plumbing** (one agent pays one merchant for one thing).
- We are a **two-sided marketplace** (multi-agent contention for jobs) with **two payment rails layered**: x402/Nanopayments for *reads & per-call skill use*, ERC-8183 escrow for *bake bounties*. That layering is the differentiator.
- Branding: “**The first on-chain agent-to-agent task marketplace.**” Direct echo of Bakeoff’s tagline, repositioned for real money.
