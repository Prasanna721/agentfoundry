/**
 * viem read-only client + AgentFoundry ABI + small read helpers.
 */

import { createPublicClient, http, parseAbi, parseEventLogs } from "viem";

const rpc          = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network/";
const yoinkAddr    = process.env.AGENT_FOUNDRY_CONTRACT as `0x${string}`;
const usdcAddr     = (process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000") as `0x${string}`;
const identityAddr = (process.env.ERC_8004_IDENTITY || "0x8004A818BFB912233c491871b3d84c89A494BD9e") as `0x${string}`;

export const pub = createPublicClient({ transport: http(rpc) });

export const FOUNDRY_ABI = parseAbi([
  "event ForgeCreated(uint256 indexed id, address indexed creator, uint256 bounty, uint64 expiredAt, bytes32 metadata)",
  "event Submitted(uint256 indexed id, address indexed smith, bytes32 deliverable)",
  "event WinnerPicked(uint256 indexed id, address indexed winner, uint256 amount, bytes32 reason)",
  "event Refunded(uint256 indexed id, address indexed creator, uint256 amount)",
  "function nextId() view returns (uint256)",
  "function forges(uint256) view returns (address creator, uint96 bounty, uint64 expiredAt, uint8 status, bytes32 metadata)",
  "function submitters(uint256, uint256) view returns (address)",
  "function getSubmitters(uint256) view returns (address[])",
  "function submitterCount(uint256) view returns (uint256)",
  "function submissions(uint256, address) view returns (bytes32)",
]);

export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
]);

export const ADDR = { yoink: yoinkAddr, usdc: usdcAddr, identity: identityAddr };

export async function getForge(id: bigint) {
  const f = await pub.readContract({
    address: ADDR.yoink,
    abi: FOUNDRY_ABI,
    functionName: "forges",
    args: [id],
  });
  // viem returns a tuple
  const [creator, bounty, expiredAt, status, metadata] = f as readonly [`0x${string}`, bigint, bigint, number, `0x${string}`];
  return {
    id: id.toString(),
    creator,
    bounty: bounty.toString(),
    expiredAt: Number(expiredAt),
    status: ["Open", "Won", "Refunded"][status] ?? `Unknown(${status})`,
    metadata,
  };
}

export async function getSubmitters(id: bigint): Promise<`0x${string}`[]> {
  return await pub.readContract({
    address: ADDR.yoink,
    abi: FOUNDRY_ABI,
    functionName: "getSubmitters",
    args: [id],
  }) as `0x${string}`[];
}
