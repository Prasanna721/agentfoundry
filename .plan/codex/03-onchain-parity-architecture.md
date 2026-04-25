# Yoink On-Chain Parity Architecture

Last updated: 2026-04-25

## Objective

Rebuild the Bakeoff model as an Arc-native system:

- real money instead of Brownie Points
- wallet-backed agent identities
- on-chain escrow and payout
- high-frequency usage billing that satisfies the hackathon economics

## Product thesis

Pure Bakeoff parity is not enough for this hackathon.

If you only rebuild:

- register agent
- create task
- accept task
- submit work
- pick winner
- pay bounty

you get a bounty marketplace, but not a strong `Nanopayments + 50+ transactions + per-action pricing` demo.

The winning version of Yoink should have two payment rails:

1. `Bounty rail`
   task-level escrow and winner payout on Arc
2. `Usage rail`
   per-query or per-action microsettlement using x402 + Circle Nanopayments

## Recommended system split

### On-chain components

#### 1. Agent Registry

Purpose:

- register agent wallet
- attach metadata URI
- optional reputation counters

Suggested fields:

- `agentAddress`
- `metadataURI`
- `createdAt`
- `isActive`
- optional `wins`
- optional `tasksCreated`
- optional `tasksCompleted`

#### 2. Task Escrow contract

Purpose:

- create paid tasks
- escrow USDC
- record deadline and metadata hash
- track accepted workers
- close with winner or refund

Suggested fields:

- `taskId`
- `creator`
- `rewardAmount`
- `deadline`
- `metadataURI`
- `status`
- `winner`

Suggested status enum:

- `Open`
- `Closed`
- `Cancelled`
- `Expired`

#### 3. Submission Registry

Purpose:

- register submission receipt on-chain without storing full artifacts

Suggested fields:

- `taskId`
- `worker`
- `submissionURI`
- `artifactHash`
- `submittedAt`

#### 4. Usage Meter / Billing surface

Purpose:

- charge per API call, query, or task step
- drive `50+` high-frequency transactions or settlement events

This should not be the same contract as task escrow. Keep it separate.

#### 5. Treasury / analytics indexer

Purpose:

- index events
- compute margins
- expose dashboards for demo and judging

## Off-chain components

### API server

Responsibilities:

- expose Yoink API
- handle auth/session around Circle or wallet identities
- store rich task descriptions, files, comments, and submission metadata
- verify that on-chain events exist before serving state transitions

### x402-protected paid endpoints

This is the part that makes the hackathon demo strong.

Examples:

- `/agent/run-step`
- `/agent/evaluate-submission`
- `/agent/fetch-task-context`
- `/agent/score-worker`
- `/compute/infer`

Each request should:

- return `402 Payment Required` when unpaid
- accept `PAYMENT-SIGNATURE`
- settle via Nanopayments
- meter value per call

### Demo indexer / dashboard

Show:

- number of tasks created
- number of accepts
- number of submissions
- number of winner payouts
- total micro-payments
- `50+` transactions or settlement records
- average price per action
- comparison with traditional gas costs

## Circle/Arc product choices

### Arc

Use Arc for:

- settlement chain
- smart contracts
- final payout events
- all state that judges should verify on explorer

Relevant current details:

- Arc Testnet chain ID is `5042002`
- RPC is `https://rpc.testnet.arc.network`
- native gas token is `USDC`
- Arc gives deterministic sub-second finality

### USDC on Arc

Important implementation detail:

- native gas accounting uses `18 decimals`
- the ERC-20 USDC interface uses `6 decimals`
- the ERC-20 contract address on Arc Testnet is `0x3600000000000000000000000000000000000000`

Recommendation:

- use the ERC-20 interface in app logic
- avoid mixing native 18-decimal and ERC-20 6-decimal values in business logic

### Circle Wallets

Use Circle Wallets for agent wallets.

Best fit:

- `developer-controlled wallets` for autonomous agents
- optional user-controlled wallet later for human overseers

Reason:

- agents need programmatic signing
- you do not want raw private key operations spread across app code
- Circle Wallets gives you backend APIs for wallet creation and transaction execution

### Circle Nanopayments

Use Nanopayments for:

- pay-per-query
- pay-per-evaluation
- pay-per-compute-step
- real-time agent-to-agent service usage

This is your proof that the system supports economics that normal chains cannot.

### Circle Gateway

Use Gateway if you want:

- unified balances
- instant movement of USDC across supported chains
- chain-abstracted funding for agents

For MVP, Gateway is optional but strategically useful because Nanopayments already sits on top of Gateway batching.

### Bridge Kit

Treat Bridge Kit as optional MVP scope.

Use it if you want a clean demo where a user or agent funds from another chain and lands on Arc with less friction.

Do not make it a hard dependency for the first working demo.

## Recommended payment flows

### Flow A: Task bounty

1. creator agent registers
2. creator creates task metadata off-chain
3. creator escrow-funds task in USDC on Arc
4. worker agents accept
5. worker submits artifact URI and hash
6. creator selects winner
7. escrow releases USDC to winner

This gives you Bakeoff parity.

### Flow B: Usage-based microbilling

1. worker or buyer agent calls a paid endpoint
2. server responds `402 Payment Required`
3. client signs payment payload
4. seller verifies via facilitator or Gateway tooling
5. server returns paid response
6. settlement is batched through Nanopayments

This gives you hackathon differentiation.

### Flow C: Optional crosschain top-up

1. user funds a Gateway balance or bridges in
2. agent gains spendable USDC flow
3. task payouts and micro-payments settle on Arc

This is nice for demo polish, not first priority.

## Endpoint parity plan

Bakeoff endpoint -> Yoink equivalent:

- `POST /api/agent/register` -> wallet-backed agent registry write
- `GET /api/agent/me` -> indexer profile + on-chain stats
- `POST /api/agent/bakes` -> task escrow create
- `POST /api/agent/bakes/{id}/accept` -> accept-task tx
- `POST /api/agent/bakes/{id}/submit` -> submission receipt tx plus off-chain artifact
- `POST /api/agent/bakes/{id}/select-winner` -> winner-select tx plus payout
- `POST /api/agent/bakes/{id}/cancel` -> cancel/refund tx
- `GET /api/agent/transactions` -> indexer over contract events
- `/api/agent/rates` -> analytics over historical on-chain payouts and API usage

## MVP scope that can actually ship

### Must-have

- agent registry
- task creation with USDC escrow
- accept task
- submit artifact URI
- winner selection and payout
- one x402/Nanopayments-protected endpoint
- dashboard proving `50+` settled actions or txs

### Should-have

- explorer links
- profile page with on-chain stats
- simple reputation counters
- submission list and winner history

### Nice-to-have

- comments
- file uploads
- crosschain top-ups
- agent trust layer with ERC-8004 concepts

## How to hit the `50+` transaction requirement honestly

Do not fake this with meaningless spam transfers.

Better pattern:

- create `5-10` tasks
- have agents accept and submit against them
- run `40-60` paid micro-actions through x402-protected endpoints

Examples of micro-actions:

- task-context fetches
- evaluation passes
- scoring calls
- reranking calls
- compute slices

This creates an authentic usage-based economy instead of an empty benchmark.

## Margin explanation for judges

The business case should be explicit:

- a `0.001` to `0.01` dollar action is impossible if every action pays normal L1/L2 gas
- Arc reduces fee unpredictability because gas is denominated in USDC
- Nanopayments removes per-request gas by batching settlement
- this enables agent-to-agent APIs priced by true usage, not subscriptions or prepaid credits

## Recommended demo story

Best demo story for Yoink:

1. Requester agent posts a task with USDC escrow on Arc.
2. Worker agents discover and accept the task.
3. Worker agents call paid evaluation or context endpoints through x402.
4. Each call is monetized in real time through Nanopayments.
5. One worker submits the best result.
6. Requester selects winner and bounty settles on Arc.
7. Dashboard shows on-chain task escrow events plus high-frequency usage payments.

That story covers:

- agent-to-agent payments
- usage-based billing
- real-time micro-commerce
- actual Arc settlement

## Implementation caution

One important design rule:

do not try to make the agent's entire reasoning loop on-chain.

Put on-chain:

- money
- state transitions
- proofs/receipts

Keep off-chain:

- inference
- document storage
- ranking logic
- large payloads

That split is the only practical way to keep parity with Bakeoff while also satisfying the Arc/Circle hackathon constraints.
