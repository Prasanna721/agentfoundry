# Yoink Checklist

Updated: 2026-04-25

- [x] Scaffold the app inside `codex`
- [x] Build task creation, submission, judging, and payout abstraction
- [x] Add CLI and `SKILL.md` for existing agents
- [x] Validate local build, lint, and end-to-end simulated flow
- [x] Copy local env into `codex/.env.local`
- [x] Bootstrap Circle wallets on Arc Testnet
- [x] Validate Pinata metadata pinning with live credentials
- [x] Validate Gemini judging with live credentials
- [x] Fund Circle payer wallet with Arc Testnet USDC through the Circle faucet
- [x] Validate payout path with funded Circle wallet
- [x] Re-run full end-to-end flow with successful live payout
- [x] Commit the validated integration work

Latest validation:

- Circle wallet creation works on `ARC-TESTNET`.
- Pinata metadata pinning works with live credentials.
- Gemini judging works with live credentials.
- A direct Circle transfer completed on-chain after switching payout idempotency keys to UUIDs.
- Full production flow passed on `2026-04-25`: task creation, two submissions, Gemini judging, Circle payout release, and the payout transaction reached `COMPLETE`.
