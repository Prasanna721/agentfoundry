# Bakeoff Reverse Engineering

Last verified: 2026-04-25

## What Bakeoff is

Bakeoff is an agent-to-agent task marketplace:

- Agents register once and receive an API key plus `1000 BP` starting balance.
- Agents can post tasks called `bakes`.
- Other agents accept bakes, submit work, and compete for the full bounty.
- The bake creator picks one winner.
- The winner receives `100%` of the bounty and there are no platform fees.

Primary public surfaces:

- Landing page: <https://www.bakeoff.app/>
- Agent skill: <https://www.bakeoff.app/SKILL.md>
- API docs: <https://www.bakeoff.app/docs>
- API host actually used by docs and examples: <https://www.bakeoff.ink>

## Key architecture observations

Observed directly from the public site and headers:

- Frontend is a `Next.js` app served on Vercel.
- Docs are public and server-rendered.
- API is split onto `bakeoff.ink` rather than `bakeoff.app`.
- API is Bearer-token based with keys prefixed `bk_`.
- The product is intentionally optimized for autonomous polling, not websockets or push notifications.

This implies the core system is simple:

- stateless HTTP API
- auth by agent API key
- server-side state machine for bake lifecycle
- internal ledger for Brownie Points
- file attachment storage behind uploaded URLs

## Core objects

### Agent

Fields exposed publicly:

- `id`
- `name`
- `description`
- `status`
- `browniePoints`
- `stats.bakesAttempted`
- `stats.bakesWon`
- `stats.bakesCreated`
- `createdAt`

Behavior:

- registration is public
- name must be unique
- API key is only returned once

### Bake

Fields seen across docs and examples:

- `id`
- `title`
- `description`
- `category`
- `bounty`
- `deadline`
- `targetRepo` optional
- `attachments`
- `attachmentCount`
- `commentCount`
- `acceptedCount`
- `submissionCount`
- `creatorAgent`
- `publishedAt`
- inferred `status`: `open`, `closed`, `cancelled`

### Submission

Supported types:

- `github`
- `zip`
- `deployed_url`
- `pull_request`

Likely fields:

- `id`
- `submissionType`
- `submissionUrl`
- optional `prNumber`
- `submittedAt`
- `isWinner`
- `agent`

### Comment

- `id`
- `content`
- `parentId`
- author metadata
- delete cascades to nested replies

### Transaction

Transaction types explicitly documented:

- `registration_bonus`
- `bake_created`
- `bake_won`
- `bake_cancelled`
- `bake_expired`

## Brownie Points economy

Bakeoff runs on an internal non-crypto currency:

- registration gives `+1000 BP`
- posting a bake escrows `-bounty`
- winning pays `+bounty`
- cancelling or expiry refunds `+bounty`

Important behavior from the public `SKILL.md`:

- minimum bounty is `100 BP`
- market-rate guidance is available from `/api/agent/rates`
- abandoned bakes auto-cancel and refund after `7 days` past deadline if no winner was selected
- expiry processing runs automatically and does not require manual cleanup

This internal points ledger is the main thing your on-chain version should replace with actual USDC settlement.

## Full API surface

### Registration and identity

- `POST /api/agent/register`
- `GET /api/agent/me`

Rules:

- registration is public
- all other endpoints require Bearer auth
- lost API keys cannot be recovered

### Discovery and task lifecycle

- `GET /api/agent/bakes`
- `GET /api/agent/bakes/{id}`
- `POST /api/agent/bakes`
- `POST /api/agent/bakes/{id}/accept`
- `POST /api/agent/bakes/{id}/cancel`
- `POST /api/agent/bakes/{id}/select-winner`

Important hidden rules from the docs plus `SKILL.md`:

- `mine=true` returns your bakes across all statuses, not just open ones
- creators can select a winner before the deadline
- you cannot accept your own bake
- you cannot accept after deadline
- accept is one-time per bake per agent
- cancel only works if there are no submissions yet
- submissions are visible only to the creator or after closure

### Submission lifecycle

- `POST /api/agent/bakes/{id}/submit`
- `GET /api/agent/my-submissions`

Rules:

- must accept before submit
- one submission per bake
- no revisions flow is documented
- cannot submit to your own bake
- `pull_request` submissions must match the bake's `targetRepo`

### Collaboration

- `GET /api/agent/bakes/{id}/comments`
- `POST /api/agent/bakes/{id}/comments`
- `DELETE /api/agent/comments/{id}`

### Funds and pricing

- `GET /api/agent/transactions`
- `POST /api/agent/uploads`
- `GET /api/agent/rates`

## Rate limits

Published rate limits:

- general API: `60 requests / minute / IP`
- registration: `10 requests / minute / IP`
- bake creation: `1 request / 5 minutes / agent`
- file upload: `10 requests / hour / agent`

This matters for parity because the product expects polling, but also throttles spam.

## Workflow model

### Worker loop

Bakeoff's skill makes the intended worker behavior explicit:

1. poll open bakes
2. evaluate fit
3. accept
4. do work outside Bakeoff
5. submit result URL
6. poll for win status via submissions, transactions, or balance

### Client loop

1. check rate guidance
2. create a bake with clear spec
3. wait while other agents compete
4. review submissions
5. select winner early if one is good enough

### Why this matters for Yoink

Bakeoff is not just a bounty board. It is a specific coordination loop:

- discovery
- escrow
- commitment
- submission
- judgment
- payout

Your on-chain variant needs all six pieces, even if the storage and execution layers change.

## State machine

Inferred bake lifecycle:

- `open`
- `accepted` by one or more workers while still open
- `submitted` by one or more workers while still open
- `closed` after winner selection
- `cancelled` if manually cancelled before submissions
- `expired/cancelled` after deadline or abandoned review window

Important nuance:

- acceptance does not reserve exclusivity
- multiple workers can compete on the same bake
- the creator retains full discretionary winner selection

## Data model you should preserve

Minimal parity fields for an on-chain rebuild:

- agent identity
- task metadata URI or hash
- escrowed bounty amount
- deadline
- acceptance records
- submission receipts with content hashes or URIs
- winner selection event
- payout events
- transaction history

Nice-to-have parity:

- comments
- file attachments
- market-rate analytics
- reputation leaderboard

## What should not go fully on-chain

Bakeoff's original design is off-chain enough that forcing every field on-chain would be wasteful.

Keep off-chain:

- large task descriptions and attachments
- full submission artifacts
- comments and discussion
- heavy ranking/evaluation logic

Keep on-chain:

- escrow
- lifecycle transitions
- canonical timestamps
- winner selection
- payout settlement
- optional agent registry and reputation checkpoints

## Mapping Bakeoff to an Arc/USDC version

Replace:

- Brownie Points ledger -> real USDC escrow on Arc
- API-key-only identity -> wallet-backed agent identity
- opaque internal transactions -> on-chain events
- server-only task state -> contract-backed state with off-chain indexing

Preserve:

- open competition
- early winner selection
- creator-controlled review
- task decomposition model
- per-task escrow economics

## Product risks revealed by the reverse engineering

If you clone Bakeoff too literally on-chain, you inherit several problems:

- subjective winner selection can feel unfair without reputation or slashing
- storing attachments on-chain is wasteful
- comments and conversational coordination do not belong onchain
- one-shot submissions with no revisions may be too rigid for real work
- escrow-only task bounties do not satisfy the hackathon's requirement for `50+` on-chain transactions unless you also add usage-based micropayments

That last point is the biggest strategic issue: a faithful Bakeoff clone is not automatically a winning Arc/Circle hackathon demo. You need bounty escrow plus high-frequency per-action settlement.
