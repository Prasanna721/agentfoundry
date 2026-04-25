# Agentic Economy on Arc Hackathon

Last verified: 2026-04-25

Primary page: <https://lablab.ai/ai-hackathons/nano-payments-arc>

## Event timing

The current event page states:

- hackathon runs `April 20-26, 2026`
- online submissions were due by `April 25, 2026`
- on-site build day is `April 25, 2026` in San Francisco
- live demos and awards are `April 26, 2026`

Venue listed:

- MindsDB SF AI Collective
- `3154 17th St, San Francisco, California, USA`

## Core challenge

The high-level challenge is stable:

- build an agentic-economy product on Arc
- use `USDC`
- use `Circle Nanopayments`
- prove per-action pricing is economically viable
- settle on Arc

The page explicitly says all submissions must:

- demonstrate real per-action pricing at `<= $0.01`
- show transaction frequency data with `at least 50+ onchain transactions` in the demo
- include a margin explanation showing why the model would fail with traditional gas costs

This is the single most important constraint for scoping Yoink.

## Tracks on the page

The event page currently contains two overlapping sets of tracks/challenge text.

### Arc/Circle tracks

- Per-API Monetization Engine
- Agent-to-Agent Payment Loop
- Usage-Based Compute Billing
- Real-Time Micro-Commerce Flow

### x402/startup-style tracks

- Agent-to-Agent Payments
- Consumer AI Payments
- B2B FinOps & Compliance
- On-chain Commerce Primitives

## Recommended positioning for Yoink

Yoink fits best as a blend of:

- `Usage-Based Compute Billing`
- `Agent-to-Agent Payment Loop`
- `On-chain Commerce Primitives`

Why:

- the original Bakeoff model already has agent-to-agent work exchange
- your on-chain variant can meter payment per query, per task step, or per compute unit
- x402-protected endpoints give you micro-commerce flow with real request-level settlement

## Required technologies

The event page marks these as required:

- `Arc` for settlement
- `USDC` as the value layer and gas token
- `Circle Nanopayments`

What that means concretely:

- all settlement should happen on Arc
- your task/bounty/payout logic should denominate in USDC
- your high-frequency action layer should use Nanopayments or an x402-compatible flow backed by Nanopayments

## Recommended technologies

The page explicitly recommends:

- `Circle Wallets`
- `Circle Gateway`
- `Circle Bridge Kit`

Interpretation:

- Circle Wallets is the strongest default for wallet creation and agent wallet orchestration
- Gateway is useful if you want chain-abstracted USDC balances or crosschain top-ups
- Bridge Kit is optional for your MVP, but useful if you want to show easy funding or chain-agnostic UX

## Third-party tooling called out on the page

- `x402 facilitator` from thirdweb
- `circle-titanoboa-sdk`
- `Vyper-agentic-payments`
- `ERC-8004-vyper`

Meaning:

- you are allowed to use a facilitator instead of writing settlement plumbing yourself
- Vyper/agentic-payment repos are reference implementations, not mandatory
- ERC-8004 identity/reputation is relevant if you want agent registry or agent trust layers on-chain

## Developer setup items explicitly encouraged

The page strongly encourages participants to:

- create a `Circle Developer Account`
- use the same email as hackathon registration
- use the `Circle Faucet`

Useful resources listed on the page:

- Arc docs
- Circle Nanopayments docs
- Circle developer docs
- Circle GitHub
- Circle Developer Console
- Circle faucet

## Submission checklist

The event page's `What to submit?` section currently requires:

- project title
- short description
- long description
- technology and category tags
- cover image
- video presentation
- slide presentation
- public GitHub repository
- demo platform / hosting
- application URL
- required `Circle Product Feedback` field

If you skip the feedback field, you also forfeit eligibility for the separate `Product Feedback Incentive`.

## Judging criteria

The page currently lists four judging buckets:

- Application of Technology
- Presentation
- Business Value
- Originality

Implication for build choices:

- do not ship a vague on-chain bounty board
- show why Arc/Nanopayments materially improves the economics
- make the demo legible and quantifiable
- frame the product as something agents or APIs would actually use

## Prizes

The event page advertises a total prize pool of `15,000+ USD`.

Because the page mixes sponsor blocks and challenge variants, prize breakdowns should be rechecked on the live page before final submission.

## Important ambiguity on the event page

The page appears to combine:

- the Arc/Circle nanopayments challenge
- an x402 startup challenge framing
- partner blocks such as Gemini

That is not a blocker, but it means your final narrative should be simple:

- Arc for settlement
- USDC everywhere
- Nanopayments for high-frequency usage billing
- Bakeoff-style agent marketplace as the product

## Concrete acceptance criteria for Yoink

For your project to clearly qualify, it should show all of the following in one demo:

- agents have wallets or registered on-chain identities
- a requester agent posts paid work or opens paid API access
- a worker agent or buyer agent triggers real usage
- each usage event causes real Arc-settled payment or Nanopayments-backed settlement
- the demo includes at least `50` on-chain transactions or verifiable settlement records
- the pricing is sub-cent or low-cent and explicitly impossible on normal gas-heavy chains

## What not to optimize for first

Lower priority for the hackathon:

- rich social/comment features
- full marketplace discovery UX
- broad crosschain support
- complicated dispute resolution

Higher priority:

- real USDC flow
- measurable high-frequency payment loop
- clean agent-to-agent demo
- strong economic explanation

## Best framing for judges

Suggested one-line framing:

`Yoink is an on-chain Bakeoff for agents on Arc: tasks, bids, and payouts are settled in USDC, while API calls and compute are monetized in real time through Circle Nanopayments.`
