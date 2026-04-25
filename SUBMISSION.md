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

### What worked exceptionally well

1. **Arc's USDC-as-gas is genuinely magic for sub-cent products.** We never thought about gas tokens once. Bounty pricing, paywall pricing, and gas are all denominated in the same unit, so the margin math is one mental model. This is the real win of Arc; everything downstream is downstream of this.

2. **Circle Developer-Controlled Wallets + Smart Contract Platform got us to "agents transacting on chain" in 30 minutes.** Wallet creation is a single API call. `createContractExecutionTransaction` with a function signature + ABI parameters is exactly the abstraction we wanted — no private key juggling, no node operator concerns.

3. **ERC-8004 deployed at well-known addresses on Arc Testnet was a huge accelerator.** We minted identity NFTs, set up reputation scaffolding, and didn't have to deploy anything ourselves. The fact that Arc has decided this is a first-class concept and shipped reference deployments is a meaningful product decision.

4. **Codex CLI and Claude Code CLI as off-the-shelf "agents" is the killer demo.** The judges watch real, production AI tools — not a test stub — read SKILL.md, solve a forge, and get paid in real USDC. That this works at all is a load-bearing piece of the hackathon thesis.

### What was rough

1. **Programmatic Circle faucet requires a mainnet API key.** `POST /v1/faucet/drips` returns `403 Forbidden` for sandbox/test keys, with no way to enable it for testnet-only usage. We had to fall back to manual UI drips at `faucet.circle.com`. For an *agentic* hackathon, this is the wrong default — we want every step to be automatable, including funding. The console-side faucet has a 5-requests-per-team-per-24h cap that's easy to hit accidentally during dev. The right default would be: testnet API keys can call programmatic faucet at the same rate as the UI, on the same per-team budget.

2. **`@circle-fin/smart-contract-platform` v10.3 SDK throws `TypeError: undefined is not an object (evaluating 'a.config')` inside the bundled `forge` crypto library** when calling `deployContract`. We dug into the bundle, couldn't isolate it cleanly under time pressure, and fell back to `forge create` with a fresh EOA funded from a Circle wallet (`scripts/fund-deployer.ts`). This is a regression — the same code path works on `@circle-fin/developer-controlled-wallets` v7.3 in the same project. Worth a triage.

3. **Circle Nanopayments facilitator URL** isn't documented as a public, sandbox-callable endpoint in Circle's hackathon materials. We built our x402 middleware in two modes (challenge-only vs. facilitator-verified), but couldn't actually exercise the Nanopayments off-chain ledger from a sandbox key. A "test facilitator URL that accepts test keys" would close this loop.

4. **Arc Testnet RPC has occasional intermittent 5xx during high-frequency parallel reads.** We saw it once during the 10-forge demo and had to retry. Easy workaround (caching `nextId` and rate-limiting parallel reads) but worth flagging.

5. **Arc Testnet explorer (`testnet.arcscan.app`) doesn't surface contract verification UI.** We deployed via `forge create` and would have liked to verify source for the demo. The explorer accepts an `etherscan` API but the verification flow isn't documented for Arc Testnet.

6. **The lablab.ai event page returns 403 to bots** for the hackathon registration / project pages. We had to triangulate the hackathon rules from search snippets and community blog posts. For a hackathon explicitly soliciting AI agents, this is ironic — agents can't reliably read the rules. Recommendation: mirror the page behind a public `lablab.ai/raw/<event>` JSON.

### What we would build next if the deadline let us

- **Reputation-gated bidding via ERC-8004**, with `IACPHook`-style policy enforcement on the marketplace contract.
- **Per-tool-call x402 paywalls between smiths**, where one smith can pay another for a sub-skill (e.g., "summarize this URL" for $0.001). This is where Nanopayments' batched gasless model truly shines.
- **A working Circle Nanopayments facilitator wired in,** so the X-PAYMENT verification roundtrip is end-to-end real, not just protocol-shaped.
- **Cross-chain: wrap CCTP into a "post a forge from any chain" flow.**
- **An anti-Sybil staking layer** for high-bounty forges, mediated by the same hooks.

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
