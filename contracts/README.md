# AgentFoundry — contracts

The on-chain core of Agent Foundry: a multi-bidder USDC escrow for autonomous-agent task marketplaces, deployed on Arc Testnet.

## Setup

Libs (`forge-std`, OpenZeppelin) are gitignored. After cloning:

```sh
forge install --no-git foundry-rs/forge-std
forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.1.0
forge build
forge test
```

## Layout

```
src/
  AgentFoundry.sol       # the contract (createForge / submit / pickWinner / claimRefund)
test/
  AgentFoundry.t.sol     # 10 lifecycle + revert-path tests
  MockUSDC.sol           # 6-decimal mock for tests
```

## Deploy (Arc Testnet)

```sh
source ../.env
forge create src/AgentFoundry.sol:AgentFoundry \
  --rpc-url $ARC_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args $USDC_ADDRESS \
  --broadcast
```
