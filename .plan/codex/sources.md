# Sources

Verified on 2026-04-25 unless noted otherwise.

## Bakeoff

- <https://www.bakeoff.app/>
  - landing page, public product positioning
- <https://www.bakeoff.app/SKILL.md>
  - autonomous agent workflow, hidden operational rules, auto-cancel behavior, polling strategy
- <https://www.bakeoff.app/docs>
  - public API surface, request/response contracts, rate limits, transaction types
- <https://www.bakeoff.ink>
  - API host used by Bakeoff docs and examples

## Hackathon

- <https://lablab.ai/ai-hackathons/nano-payments-arc>
  - event dates, tracks, required technologies, judging criteria, what-to-submit checklist

## Arc

- <https://docs.arc.network/arc/references/connect-to-arc>
  - RPC, chain ID, explorer, faucet, Arc Testnet metadata
- <https://docs.arc.network/arc/references/gas-and-fees>
  - current testnet gas policy and USDC-as-gas details
- <https://docs.arc.network/arc/concepts/stable-fee-design>
  - economic rationale for stable USDC-denominated fees
- <https://docs.arc.network/arc/references/evm-compatibility>
  - EVM differences, deterministic finality, native-vs-ERC20 USDC behavior
- <https://docs.arc.network/arc/references/contract-addresses>
  - Arc Testnet contract addresses for USDC, Gateway, and related contracts

## Circle

- <https://developers.circle.com/wallets>
  - Circle Wallets overview
- <https://developers.circle.com/wallets/dev-controlled>
  - why developer-controlled wallets fit autonomous agents
- <https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-wallet>
  - concrete wallet creation API reference
- <https://developers.circle.com/gateway>
  - Gateway overview and positioning versus CCTP
- <https://developers.circle.com/gateway/references/technical-guide>
  - Gateway system model, contracts, trustless withdrawal, instant transfer concepts
- <https://developers.circle.com/gateway/howtos/create-unified-usdc-balance>
  - Arc Testnet Gateway wallet and USDC contract examples
- <https://developers.circle.com/gateway/nanopayments>
  - Nanopayments overview and buyer/seller flow
- <https://developers.circle.com/gateway/nanopayments/concepts/x402>
  - x402 protocol basics from Circle's Nanopayments perspective
- <https://developers.circle.com/gateway/nanopayments/howtos/facilitator-integration>
  - facilitator integration path for gas-free x402 settlement
- <https://developers.circle.com/bridge-kit>
  - note that Bridge Kit docs moved into Arc App Kit docs
- <https://developers.circle.com/bridge-kit/tutorials/installation>
  - current Bridge Kit package/adapters

## x402

- <https://docs.x402.org/core-concepts/http-402>
  - protocol-level meaning of HTTP 402 and the V2 headers
- <https://www.x402.org/>
  - high-level standard positioning and ecosystem adoption framing

## Third-party facilitator

- <https://portal.thirdweb.com/x402/facilitator>
  - optional x402 facilitator route if you do not want to build facilitator infrastructure from scratch
