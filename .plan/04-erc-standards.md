# ERC-8183 (Agentic Commerce) and ERC-8004 (Agent Identity / Reputation)

These two ERCs are **the** on-chain primitives Arc is pushing for the agentic economy. Together they cover everything Bakeoff has and more. We will use both directly.

---

## ERC-8183 — Agentic Commerce Protocol

> A **Job** with escrowed budget, four states (Open → Funded → Submitted → Terminal), and an **evaluator** who alone may release/refund.

Reference contract on Arc Testnet: **`0x0747EEf0706327138c69792bF28Cd525089e4583`**.

### State machine

```
        createJob               fund                   submit
   ┌──────────────────► Open ──────────► Funded ──────────► Submitted
   │                     │                  │                     │
   │             reject  │           reject │              complete│ reject
   │                     ▼                  ▼                     ▼  ▼
   │                  Rejected         Rejected               Completed   Rejected
   │                     ▲                  ▲                     │
   └─ claimRefund (after expiredAt, perm.) Funded/Submitted ──► Expired
```

Terminal states: **Completed** (escrow → provider), **Rejected** (escrow → client refund), **Expired** (escrow → client refund via permissionless `claimRefund`).

### Roles (tripartite)

- **Client** — creates job, sets budget, calls `fund()`, can `reject` only while Open.
- **Provider** — performs work, calls `submit(jobId, deliverableHash)`. Can negotiate budget via `setBudget`.
- **Evaluator** — single address per job, set at creation, **immutable**. Only the evaluator may `complete` or `reject` once the job is Funded/Submitted. May equal client (self-evaluation) or be a contract / DAO / oracle.

### Function surface (Solidity)

```solidity
function createJob(
    address provider,           // MAY be 0; client must setProvider before fund
    address evaluator,          // MUST be non-zero
    uint256 expiredAt,          // MUST be future
    string  calldata description,
    address hook                // MAY be 0
) external returns (uint256 jobId);

function setProvider(uint256 jobId, address provider) external;          // client only, while Open
function setBudget  (uint256 jobId, uint256 amount, bytes calldata opt) external;  // client OR provider, while Open
function fund       (uint256 jobId, uint256 expectedBudget, bytes calldata opt) external; // client only

function submit  (uint256 jobId, bytes32 deliverable, bytes calldata opt) external; // provider only
function complete(uint256 jobId, bytes32 reason,      bytes calldata opt) external; // evaluator only, when Submitted
function reject  (uint256 jobId, bytes32 reason,      bytes calldata opt) external; // client when Open; evaluator when Funded/Submitted
function claimRefund(uint256 jobId) external;                                       // permissionless, after expiredAt, while Funded/Submitted
```

`expectedBudget` on `fund` prevents front-running of `setBudget` between client’s decision and tx mining.

### Job struct (logical)

```
struct Job {
  address client;
  address provider;     // may be 0 at creation
  address evaluator;    // immutable
  string  description;
  uint256 budget;
  uint256 expiredAt;
  Status  status;       // Open | Funded | Submitted | Completed | Rejected | Expired
  address hook;         // optional IACPHook
}
```

Single ERC-20 per contract instance (we deploy ours pre-bound to USDC on Arc).

### Events (full set)

```solidity
event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt);
event ProviderSet(uint256 indexed jobId, address indexed provider);
event BudgetSet(uint256 indexed jobId, uint256 amount);
event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
event JobRejected (uint256 indexed jobId, address indexed rejector, bytes32 reason);
event JobExpired  (uint256 indexed jobId);
event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
event Refunded       (uint256 indexed jobId, address indexed client,   uint256 amount);
```

### Hooks (optional)

```solidity
interface IACPHook {
  function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
  function afterAction (uint256 jobId, bytes4 selector, bytes calldata data) external;
}
```

Hookable: `setProvider`, `setBudget`, `fund`, `submit`, `complete`, `reject`. **Not hookable: `claimRefund`** (permissionless safety valve).

Hook patterns we could use:
- **ReputationGate** — block `submit` unless provider ERC-8004 score ≥ threshold.
- **Auction** — accept multiple `submit`s and resolve to lowest acceptable on `complete` (extends single-provider semantics; better for v2).
- **PlatformFee** — skim N bps on `complete`, route to treasury.

### Security pillars (per spec)
- Reentrancy guard around all token-transferring functions.
- SafeERC20 throughout.
- Evaluator is **trusted** — pair with ERC-8004 reputation for high-value work.
- Once Funded, client cannot unilaterally pull funds (protects provider mid-work).
- No on-chain dispute resolution — escalate off-chain.

### Lifecycle tx count

A full bake from create→fund→submit→complete is **at minimum 4 tx** (createJob, fund, submit, complete). Add `setBudget` and (if used) `setProvider` and you’re at 5–6. Add the USDC `approve` before `fund` — 6–7 tx per bake.

**→ 8 bakes through full lifecycle = ~50 tx.** This is how we hit the “50+ on-chain tx” requirement *organically*.

### Tutorial code (Arc + Circle Wallets DCW, Node)

```ts
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circle = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

// 0. set up three wallets (client / provider / evaluator)
const ws = await circle.createWalletSet({ name: "Yoink wallets" });
const wallets = await circle.createWallets({
  blockchains: ["ARC-TESTNET"],
  count: 3,
  walletSetId: ws.data!.walletSet!.id,
  accountType: "SCA",
});
const [clientW, providerW, evaluatorW] = wallets.data!.wallets!;

// 1. createJob (client)
await circle.createContractExecutionTransaction({
  walletAddress: clientW.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: process.env.ERC_8183!,
  abiFunctionSignature: "createJob(address,address,uint256,string,address)",
  abiParameters: [
    providerW.address,
    evaluatorW.address,           // self = client.address for self-evaluation
    `${Math.floor(Date.now()/1000) + 3600}`,
    "Bake: write a Solidity ERC-20 with permit",
    "0x0000000000000000000000000000000000000000",
  ],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

// 2. setBudget (provider proposes 5 USDC = 5_000_000 with 6 decimals)
// 3. approve USDC allowance to ERC-8183 from client
// 4. fund (client)
// 5. submit (provider) — bytes32 IPFS CID hash
// 6. complete (evaluator) — releases USDC to provider
```

(Argument shapes verified against the Arc tutorial blog post.)

---

## ERC-8004 — Agent Identity, Reputation, Validation

> Identity, validation, and reputation registries that complement ERC-8183. ERC-8183 is the **economic event**; ERC-8004 is **who the agent is, who validated their work, what reputation they have**.

### Three registries on Arc Testnet

| Registry | Address | Role |
|---|---|---|
| `IdentityRegistry`   | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | Mints an ERC-721 NFT representing each agent identity, bound to `metadataURI` (IPFS JSON: name, image, capabilities, version). |
| `ReputationRegistry` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `giveFeedback(agentId, score, type, tag, tagHash)` — third-parties record signal. **Owners cannot self-rate.** |
| `ValidationRegistry` | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | Two-step: `validationRequest(validator, agentId, requestURI, requestHash)` → `validationResponse(requestHash, code, …)`. Codes: 100 = pass, 0 = fail. |

### Why we register every agent
- **Onboarding** = `register(metadataURI)` mints an NFT → emits a `Transfer` event we parse for the agentId.
- **Win → ReputationRegistry.giveFeedback** with derived score (e.g. 100 for win, 50 for participation, 0 for rejection).
- **Validator wallets are separate** to avoid self-dealing — for our build, the bake creator doubles as validator (acceptable per the standard, just remove the self-vote restriction by routing feedback from a 2nd creator-owned wallet, or use a single global validator wallet that acts on `JobCompleted` events).

### Cost
- ~0.006 USDC-TESTNET per tx on Arc Testnet (Circle Gas Station can sponsor for SCA wallets, though paying it ourselves is fine and counts toward the demo tx total).

### Agent metadata example (IPFS JSON)

```json
{
  "name": "yoink-codebot-01",
  "description": "Solidity / TypeScript writer; specializes in ERC tokens.",
  "image": "ipfs://bafybeih.../avatar.png",
  "type": "ai-agent",
  "version": "1.0.0",
  "capabilities": ["code", "research"],
  "endpoints": {
    "skill": "https://yoink.example/agents/codebot-01/skill",
    "x402_paywall": "https://yoink.example/agents/codebot-01/skill"
  }
}
```

### Tx-count contribution
For each agent: register (+1 tx). For each win: giveFeedback (+1 tx). 5 agents × register + 10 wins × feedback = 15 tx on top of bake lifecycle.

---

## How the layers combine in one screen

```
                      ┌────────────────────────────────────────────────┐
                      │   Yoink registry UI (next.js)  /  CLI agent    │
                      └──────────────┬─────────────────────────────────┘
                                     │ x402 paywalled GET / POST  ($0.001 / call)
                                     ▼
            ┌──────────────────────────────────────────────────┐
            │ Yoink API (express + x402-express middleware)    │
            │  • GET  /bakes              ($0.001)             │
            │  • GET  /bakes/:id          ($0.001)             │
            │  • POST /agents/:id/skill   ($0.001 – $0.01)     │
            │  Below: ERC-8183 bake mutations require on-chain │
            └────┬───────────────────────────────────┬─────────┘
                 │                                   │
       Circle Nanopayments facilitator        Arc Testnet RPC
       (off-chain ledger, batched on-chain)   ┌─────────────────────┐
                 │                            │ ERC-8183 contract   │
                 ▼                            │ ERC-8004 registries │
       periodic batch settlement → Arc        │ USDC token          │
                                              └─────────────────────┘
```

This is *the* picture for the demo deck.
