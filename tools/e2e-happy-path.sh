#!/usr/bin/env bash
# End-to-end happy-path test against a running Agent Foundry API.
#
# Drives: createForge -> 2x submit -> pickWinner.
# Verifies winner USDC balance increased by exactly the bounty.
#
# Requires the API to be running:  bun --env-file=.env apps/api/index.ts

set -euo pipefail
API="${API:-http://localhost:3000}"
BOUNTY="${BOUNTY:-0.5}"  # USDC, decimal
EXPIRES="${EXPIRES:-600}"

source .env

YOINK="$AGENT_FOUNDRY_CONTRACT"
USDC="$USDC_ADDRESS"
RPC="$ARC_RPC_URL"

# pull agent addresses from /agents
SMITH1=$(curl -s "$API/agents/SMITH_1" | jq -r .address)
SMITH2=$(curl -s "$API/agents/SMITH_2" | jq -r .address)
CREATOR=$(curl -s "$API/agents/CREATOR" | jq -r .address)
echo "▸ CREATOR  $CREATOR"
echo "  SMITH_1  $SMITH1"
echo "  SMITH_2  $SMITH2"

# we'll pick SMITH_2 as winner. record balances before.
BAL_BEFORE=$(cast call "$USDC" "balanceOf(address)(uint256)" "$SMITH2" --rpc-url "$RPC" | awk '{print $1}')
echo "▸ SMITH_2 USDC before: $BAL_BEFORE"

echo "▸ POST /forges (creator)"
CREATE=$(curl -s -X POST "$API/forges" -H 'Content-Type: application/json' -d "$(cat <<JSON
{
  "role": "CREATOR",
  "title": "e2e: reverse a string",
  "description": "Write a TypeScript function reverse(s: string): string. Be terse.",
  "category": "code",
  "bountyUSDC": "$BOUNTY",
  "expiresInSec": $EXPIRES
}
JSON
)")
echo "  $CREATE"
FORGE_ID=$(echo "$CREATE" | jq -r .id)

echo "▸ POST /forges/$FORGE_ID/submit  (SMITH_1)"
SUB1=$(curl -s -X POST "$API/forges/$FORGE_ID/submit" -H 'Content-Type: application/json' -d "$(cat <<JSON
{ "role": "SMITH_1", "deliverable": "export const reverse = (s: string): string => s.split(\"\").reverse().join(\"\");" }
JSON
)")
echo "  $SUB1"

echo "▸ POST /forges/$FORGE_ID/submit  (SMITH_2)"
SUB2=$(curl -s -X POST "$API/forges/$FORGE_ID/submit" -H 'Content-Type: application/json' -d "$(cat <<JSON
{ "role": "SMITH_2", "deliverable": "export function reverse(s: string): string { return [...s].reverse().join(\"\"); }" }
JSON
)")
echo "  $SUB2"

echo "▸ POST /forges/$FORGE_ID/pick-winner  (creator picks SMITH_2)"
PICK=$(curl -s -X POST "$API/forges/$FORGE_ID/pick-winner" -H 'Content-Type: application/json' -d '{"role":"CREATOR","winnerRole":"SMITH_2","reason":"shorter and uses spread"}')
echo "  $PICK"

BAL_AFTER=$(cast call "$USDC" "balanceOf(address)(uint256)" "$SMITH2" --rpc-url "$RPC" | awk '{print $1}')
echo "▸ SMITH_2 USDC after:  $BAL_AFTER"

DELTA=$(python3 -c "print($BAL_AFTER - $BAL_BEFORE)")
EXPECTED=$(python3 -c "print(int($BOUNTY * 1_000_000))")
echo "▸ delta = $DELTA  expected ≈ $EXPECTED  (winner pays own submit() gas)"

# winner = bounty inflow - own submit() gas (paid in USDC on Arc).
# Gas per tx ~ 0.001-0.005 USDC. Allow up to 0.01 USDC of gas margin.
MARGIN=10000
LOW=$(python3 -c "print($EXPECTED - $MARGIN)")

if [ "$DELTA" -ge "$LOW" ] && [ "$DELTA" -le "$EXPECTED" ]; then
  GAS=$(python3 -c "print(($EXPECTED - $DELTA) / 1_000_000)")
  echo "✓ winner paid bounty (delta $DELTA) — paid own submit gas of ~$GAS USDC"
  echo "  forge id: $FORGE_ID"
  echo "  explorer: https://testnet.arcscan.app/address/$YOINK"
  exit 0
else
  echo "✖ payout outside acceptable margin (expected $LOW <= delta <= $EXPECTED, got $DELTA)"
  exit 1
fi
