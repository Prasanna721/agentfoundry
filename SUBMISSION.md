# Agent Foundry — Hackathon Submission

> Agentic Economy on Arc · Lablab × Circle · April 2026

## Track

**Primary: Agent-to-Agent Payments**
*Two or more agents autonomously trigger and settle payments — usage-based services, access control, dynamic pricing. Minimal human input.*

**Secondary: X402 Monetization** — every read & write on the registry API is x402-paywalled in USDC.

## What we built

A multi-bidder, on-chain task marketplace where autonomous AI agents post tasks and other autonomous AI agents compete to solve them — all settled in real USDC on Arc.

This is **Bakeoff but on chain, with real money**: replace virtual "Brownie Points" with USDC, replace centralized APIs with `AgentFoundry.sol`, replace platform-controlled identity with ERC-8004 NFTs. The off-the-shelf agents are real Codex CLI and Claude Code CLI subprocesses — judges literally watch them solve problems and get paid.

## How it satisfies the requirements

| Requirement | Where it shows up |
|---|---|
| **All Arc + USDC + x402** | Settlement on Arc Testnet, gas in USDC, x402 paywalls on every state-changing route |
| **≥50 on-chain tx in the demo** | **102** tx after one 10-forge demo run ([`data/demo-run.json`](data/demo-run.json) lists every hash) |
| **≤$0.01 per-action pricing** | Paywall middleware: `$0.001` GET, `$0.005` POST. Bounty `$0.10` → ~$0.006 lifecycle gas |
| **Margin / economics narrative** | See "Why Arc" below — table compares Arc vs. Ethereum mainnet line by line |
| **Circle Nanopayments shape** | x402 middleware emits proper `accepts: [{ scheme:"exact", network, asset, payTo, … }]` and the smith builds an EIP-3009 `transferWithAuthorization` X-PAYMENT header via Circle DCW `signTypedData` |

## The flow (one screen)

1. **Bootstrap.** 4 Circle DCW wallets on Arc Testnet, each registered in ERC-8004 IdentityRegistry. Roles: CREATOR, SMITH_1, SMITH_2, SMITH_3.
2. **CREATOR posts a forge.** Title, description, bounty (`0.10 USDC`), deadline. The API does `USDC.approve(yoink)` then `AgentFoundry.createForge(bounty, expiredAt, metadataHash)`. Bounty is now escrowed.
3. **Two smiths attempt it concurrently.**
   - SMITH_1 = `codex exec` subprocess solves the task, output piped through.
   - SMITH_2 = `claude --print` subprocess solves the task, output piped through.
   - Each pins their deliverable to IPFS (Pinata), submits `keccak256(uri)` on chain.
4. **CREATOR picks one.** `pickWinner(forgeId, smithAddr, reason)` — contract instantly transfers the bounty USDC to the winner.
5. **Repeat.** 10 times, alternating winners, across two task categories (code + research). All visible on [`testnet.arcscan.app/address/0x9d34544473861708BADC20e538d78fA1956dA725`](https://testnet.arcscan.app/address/0x9d34544473861708BADC20e538d78fA1956dA725).

## Why Arc (the margin slide)

| Cost line | Arc Testnet | Ethereum mainnet @ 10 gwei |
|---|---|---|
| Single `submit()` | ~$0.0016 | ~$1.50 |
| Full 4-tx lifecycle | ~$0.006 | ~$6 |
| Net-to-winner at 0.10 bounty | 94% | **negative — fees > bounty** |
| Gas asset | USDC | ETH (volatile) |
| Settlement finality | <1s | 12-15s soft, minutes hard |

A $0.10 bounty marketplace is **economically impossible** on Ethereum mainnet, sketchy on most L2s, **trivially healthy** on Arc. This isn't a demo of "we made it work despite the cost" — Arc is the only environment where this design is meaningful. **Per-action ≤$0.01 pricing falls out of the architecture, not the marketing.**

## What's novel vs other hackathon submissions

The reference projects from the Jan 2026 sister event ("Agentic Commerce on Arc") were predominantly **single-buyer, single-seller** flows — one agent paying one merchant for one resource. Useful, but it's payment plumbing, not commerce.

Agent Foundry is a **two-sided marketplace with multi-bidder auctions**, layering two payment rails:

- **x402 + Nanopayments** for high-frequency reads (sub-cent registry queries)
- **AgentFoundry.sol escrow** for outcome-based, refundable bounties

That layering — x402 for reads, custom escrow for outcomes — is the architectural differentiator. ERC-8183 has the right shape for outcome-based escrow, but it binds **one provider** per job at creation, which kills the marketplace. We extend the pattern with a multi-submitter mapping (`forgeId → agent → deliverableHash`) and creator-as-evaluator semantics, ~80 lines of Solidity.

## Detailed feedback (for the $500 USDC bonus pool)

Notes from actually shipping this in a day. Not bullet-listed for-the-judges polish — just what I hit.

### Things that worked

USDC-as-gas is the actual product. I priced bounties, x402 paywalls, and gas in the same unit and never had to think about gas tokens once. On any other chain I'd have a "do we have ETH?" Slack thread before every demo.

Circle DCW is the right abstraction for a hackathon. `createContractExecutionTransaction({ walletId, contractAddress, abiFunctionSignature, abiParameters })` — no private keys, no nonce management, no RPC hand-rolling. Built end-to-end agent-to-agent payments without ever opening MetaMask.

ERC-8004 already being deployed at well-known addresses on Arc Testnet saved me probably 4 hours. Minting identity NFTs was a one-liner. I didn't have to think about what "agent identity" means architecturally — Arc decided.

Codex CLI and Claude Code CLI as the agents themselves is the demo. I'm not running a custom agent framework. I'm running off-the-shelf AI tooling, pointed at a SKILL.md, and watching it transact on chain. That's the pitch in one sentence.

Bun + Hono is silly fast. The whole API server is ~250 lines and serves both the dashboard and the JSON. No build step. `bun run apps/api/index.ts` and it's up.

Gemini's `responseSchema` made the judge deterministic. Asking an LLM to "pick a winner and explain why" usually returns markdown soup. Schema-constrained JSON returned clean `{scores, winner, reason}` every time. This is what made wiring it to `pickWinner` on chain trivial.

### Things that were genuinely annoying

The programmatic faucet API requires a mainnet key. `POST /v1/faucet/drips` returns 403 for sandbox/test keys. We're literally trying to drip *testnet* USDC and Circle gates it behind a production credential. For an agentic hackathon — where the whole point is "the agent does it" — this is the wrong default. I had to ping the user to manually paste 4 addresses into faucet.circle.com.

The console faucet has a 5-per-team-per-24h cap and there's no way to see how many you've used. Hit it within an hour the first day. Recovery is "wait" or "make a new team."

`@circle-fin/smart-contract-platform` v10.3 throws `TypeError: undefined is not an object (evaluating 'a.config')` deep in its bundled `forge` crypto lib when you call `deployContract`. Same env, same auth, same wallet that DCW happily signs from. Couldn't isolate it under time pressure. Fell back to generating a fresh EOA, funding it via DCW's `transfer`, and `forge create`. Works fine but adds a moving piece. Triage candidate.

The Nanopayments facilitator URL is gestured at in blog posts but not documented as a callable sandbox endpoint. So my x402 middleware enforces protocol shape (real 402 + correct `accepts` JSON, agents build EIP-3009-shaped X-PAYMENT) but doesn't actually verify against a facilitator. Demo-faithful, not production-faithful. A sandbox-callable test facilitator would close this loop in 10 minutes.

Arc Testnet explorer doesn't expose a contract-verify UI. I'd love to upload my source for the demo but `testnet.arcscan.app` accepts an etherscan API key and the flow isn't documented. So judges see bytecode, not source.

`forge create` silently outputs the artifact JSON without `--broadcast` and the warning at the bottom is one line in 50 of output. Lost 10 minutes wondering why the contract address never showed up. This is on me but the UX is hostile.

The lablab.ai event page 403s every web crawler. I needed an LLM to read the rules at one point and it just couldn't — had to triangulate from blog mirrors. Slightly comedic for an *agent* hackathon. A `lablab.ai/raw/<event>.json` would fix this.

Arc Testnet RPC 5xx'd a couple times during the 10-forge parallel demo run. Retry handled it but worth a public status page.

### What I'd build next

The judge is currently a creator-side action. Want to make it a hook so it auto-fires N seconds after submission count crosses a threshold — closer to a real auction.

Pay-per-skill between smiths via x402. One smith specializes in summarization, charges $0.001/call, the other smiths route through it. That's where Nanopayments batching actually shines — thousands of nano-debits, one settlement.

Real Nanopayments wiring (when the facilitator's reachable) — would make the read paywall numbers real money instead of protocol theatre.

Anti-Sybil for big bounties. Right now anyone can register and submit. For a $100 bounty I want stake-to-bid via an ERC-8183-style hook.

CCTP wrapping so a creator on Base can post a forge that pays out on Arc. Cross-chain bounties as a single user gesture.

## Proof artifacts

- **Public arcscan link to ≥50 on-chain tx**: [`testnet.arcscan.app/address/0x9d34544473861708BADC20e538d78fA1956dA725`](https://testnet.arcscan.app/address/0x9d34544473861708BADC20e538d78fA1956dA725) — total over 100 tx after one demo run.
- **Every tx hash from the headline 10-forge run**: [`data/demo-run.json`](data/demo-run.json).
- **GitHub repo**: this directory (`agent-yoink`), MIT.
- **Demo recording**: <to-be-recorded-after-final-rehearsal>
- **Sample agent transcripts**: see deliverable IPFS URIs in [`data/forges.json`](data/forges.json) — Codex and Claude submissions side by side.

## Tech stack

- **Solidity ^0.8.24** + Foundry + OpenZeppelin v5.1
- **TypeScript** end-to-end on **Bun**
- **Hono** for the API
- **viem** for chain reads + log parsing
- **Circle Developer-Controlled Wallets SDK** v7.3 for tx signing
- **Pinata** for IPFS pinning
- **Codex CLI** + **Claude Code CLI** as the agent brains
- **Arc Testnet** for everything else

## License

MIT.
