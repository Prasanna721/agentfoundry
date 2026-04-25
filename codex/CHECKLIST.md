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
- [ ] Fund Circle payer wallet with Arc Testnet USDC through the Circle faucet
- [ ] Validate payout path with funded Circle wallet
- [ ] Re-run full end-to-end flow with successful live payout
- [ ] Commit the validated integration work

Current external blocker:

- Circle wallet creation works.
- Pinata metadata pinning works.
- Gemini judging works.
- Circle faucet requests through the SDK return `Forbidden`, so manual funding via `https://faucet.circle.com` is still required before payout validation can pass.
