# Circle Stack — Arc, USDC, Wallets, Gateway, Nanopayments, x402

Compiled from `circle.com`, `arc.network`, `docs.arc.network/llms.txt`, x402 docs, Circle Nanopayments launch post.

## 1. Arc — the L1

- Open Layer-1, EVM-compatible, **USDC is the native gas token** (no separate gas asset).
- Sub-second deterministic finality.
- Currently **public testnet only** (as of late 2025 / early 2026).
- Standard EVM toolchain works: Hardhat, Foundry, Viem, Ethers.
- Built-in App Kit for Bridge (CCTP), Swap, Send.
- Optional privacy features at protocol level.

### Endpoints / addresses (from docs.arc.network and the ERC-8183 tutorial)

| Item | Value |
|---|---|
| Arc Testnet RPC | `https://rpc.testnet.arc.network/` |
| Arc Testnet explorer | `https://testnet.arcscan.app` |
| USDC (Arc Testnet) | `0x3600000000000000000000000000000000000000` |
| ERC-8183 reference contract (testnet) | `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ERC-8004 ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |
| Approx tx fee on Arc Testnet | ~0.006 USDC-TESTNET per tx |
| Faucet | Circle testnet faucet (https://faucet.circle.com/) |

### Why Arc fits the pitch
- USDC-denominated gas means **predictable margins on per-call pricing**: a $0.01 call has a known ~$0.006 floor (and that floor disappears once Nanopayments batches it to ~zero).
- Sub-second finality means an x402 retry round-trip feels synchronous to the agent.
- EVM compatibility means **ERC-8183 / ERC-8004 deploy as-is**.

## 2. USDC

- Stablecoin, redeemable 1:1 USD.
- On Arc, USDC = native gas + asset. Balances are 6-decimal (e.g. `5000000` = 5 USDC).
- Cross-chain via **CCTP** (Circle’s burn-and-mint bridge); Arc participates.

## 3. Circle Wallets

Two main flavors used in tutorials:

### Developer-Controlled Wallets (DCW) — recommended for this hackathon
- MPC custody, you hold API key + Entity Secret.
- Create via REST: `createWalletSet`, then `createWallets({ blockchains: ["ARC-TESTNET"], accountType: "SCA" | "EOA", count: N })`.
- Execute contract calls via `createContractExecutionTransaction({ walletAddress, blockchain, contractAddress, abiFunctionSignature, abiParameters, fee })`.
- Sign typed data via Sign Typed Data API → produces EIP-3009 / EIP-712 sigs for x402 + Nanopayments authorizations.
- Gas can be sponsored via **Circle Gas Station** (relevant for SCA wallets).

### User-Controlled Wallets (UCW) — passkey/social, more for end-user UX (skip for this build).

### SDK
- Node: `@circle-fin/developer-controlled-wallets`
- Python: `circle-developer-controlled-wallets`
- Init: `initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })`

### Credentials
- `CIRCLE_API_KEY` — from Developer Console.
- `CIRCLE_ENTITY_SECRET` — generated and registered once in Developer Console; required for write ops.

## 4. Circle Gateway

- Chain-abstracted **unified USDC balance** across supported chains.
- **Pre-deposit / non-custodial** model: deposit USDC once, agents draw from a single ledger across chains.
- Underpins **Nanopayments**: Gateway is the substrate that lets thousands of micro-debits aggregate before settling on-chain.
- API surface lives at `developers.circle.com`.

## 5. Circle Nanopayments

- Built **on top of Gateway**, follows the **x402 standard**.
- Sends **gas-free USDC** transfers as small as **$0.000001**.
- **EIP-3009 authorization flow**:
  1. Agent signs `transferWithAuthorization`-style EIP-3009 message.
  2. Forwards to Nanopayments API.
  3. API validates + adjusts internal ledger (off-chain).
  4. Merchant gets instant confirmation, releases service.
  5. **Periodic batched on-chain settlement** of all aggregated debits.
- Testnet supports: **Arbitrum, Arc, Avalanche, Base, Ethereum, HyperEVM, Optimism, Polygon PoS, Sei, Sonic, Unichain, World Chain** (as of Feb 2026).

### Where it fits in our build
- **Per-tool-call charging** between agents (e.g., a code-writing skill provider charges $0.001 per call).
- The off-chain ledger lets us cite *thousands* of nano-debits while only producing periodic on-chain settlement events. We still get on-chain batches that count toward demo tx counts, plus huge volume in the dashboard.

## 6. x402

- **HTTP-native** payment protocol from Coinbase (CDP). Revives `HTTP 402 Payment Required`.
- Co-stewarded by the x402 Foundation (Coinbase + Cloudflare; members include Google, Visa, AWS, Circle, Anthropic, Vercel).

### Flow

```
Agent  ──GET /resource─►  Server
Agent  ◄─402 + PAYMENT-REQUIRED header─  Server
Agent (signs EIP-3009 / Permit2 USDC authorization)
Agent  ──GET /resource (X-PAYMENT: <signed>)─►  Server
                                           │
                                  Facilitator (verify + settle)
                                           │
Agent  ◄─200 + body─                       
```

### Key headers
- `PAYMENT-REQUIRED` (server → client): price, accepted tokens, recipient, network.
- `X-PAYMENT` / `PAYMENT-SIGNATURE` (client → server): EIP-3009 signed authorization.

### Networks supported by Coinbase CDP facilitator
Base, Polygon, Arbitrum, World, Solana. **Arc is supported via Circle’s Nanopayments facilitator** (which is the right one to use for this hackathon).

### Pricing of the facilitator
- 1,000 free tx/month, then $0.001/tx (CDP). Use Circle facilitator instead — same protocol.

### Relationship to ERC-8183 (important; this is the framing slide)
- **x402 = synchronous, single round-trip, sub-cent.** “One HTTP call, one micropayment, you get the data.” Pay per *read*.
- **ERC-8183 = asynchronous, multi-step, larger.** “Define a job, escrow funds, await delivery, evaluate, pay or refund.” Pay per *outcome*.
- A great submission uses **both**: x402 on the registry & skill calls (high frequency, ≤$0.01), ERC-8183 on the bake bounties (escrowed, refundable, evaluator-mediated).

### Server-side libraries
- `x402-express` (npm) — paywall middleware.
- `x402-next`, `x402-hono`, equivalents for major frameworks.

```ts
app.use(paymentMiddleware(
  recipientWallet.address,
  { "GET /risk-profile": { price: "$0.01", network: "base-sepolia" } },
  { url: "https://x402.org/facilitator" }   // swap to Circle Nanopayments facilitator on Arc
));
```

## 7. Circle Smart Contract Platform & Developer Console

- **Developer Console** (`console.circle.com`) — manage API keys, Entity Secret, wallet sets, view transactions, see settlement.
- **Smart Contract Platform** — deploy contracts and call them via REST without running your own node. Useful if we don’t want to manage Hardhat deploys; instead, hit Circle’s deploy endpoint and have everything visible in console.

## 8. The “use-arc” skill / quickstarts

The Arc docs reference an internal **`use-arc` skill** that walks: chain config → RPC → contract deploy → USDC bridging → gas-payment setup. Tutorials linked from `docs.arc.network/llms.txt`:

- `register-your-first-ai-agent` (ERC-8004 quickstart)
- `create-your-first-job` (ERC-8183 quickstart)
- `bridge-usdc` (CCTP / App Kit)
- `monitor-events` (event listening pattern)

We base our build on these.
