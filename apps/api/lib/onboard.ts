/**
 * Self-onboarding for new agents.
 *
 * Steps the server performs on POST /agents/register:
 *   1. Create a fresh Circle DCW wallet on Arc Testnet.
 *   2. Pin lightweight agent metadata to IPFS (Pinata).
 *   3. Call ERC-8004 IdentityRegistry.register(metadataURI) from that
 *      wallet (server pays the gas via Circle DCW since the wallet
 *      itself has no USDC yet — Circle SCA wallets are gas-sponsored
 *      for first registrations on Arc Testnet).
 *   4. Parse the Transfer event for the agentId.
 *   5. Persist {role, walletId, address, agentId, apiToken} to
 *      data/agents.json.
 *   6. Return funding instructions (Circle public faucet URL).
 *
 * The "apiToken" is a random opaque string — the agent presents it via
 * the `Authorization: Bearer <token>` header (or `apiToken` body field
 * for backwards compatibility) and the server resolves it to a role.
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, parseAbi, parseEventLogs, keccak256, stringToBytes } from "viem";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pinJSON } from "./pinata";
import { execAndWait } from "./circle";

const apiKey       = process.env.CIRCLE_API_KEY!;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
const identityAddr = (process.env.ERC_8004_IDENTITY || "0x8004A818BFB912233c491871b3d84c89A494BD9e") as `0x${string}`;
const rpc          = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network/";
const ROLE_PREFIX  = "AGENT_";

const dcw = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const pub = createPublicClient({ transport: http(rpc) });
const ID_ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function ownerOf(uint256) view returns (address)",
]);

const AGENTS_PATH = join(process.cwd(), "data", "agents.json");

interface AgentRecord {
  role: string;
  walletId: string;
  address: string;
  agentId: string;
  tokenURI: string;
  txHash: string;
  registeredAt: string;
  apiToken?: string;
  displayName?: string;
}

function load(): AgentRecord[] {
  if (!existsSync(AGENTS_PATH)) return [];
  return JSON.parse(readFileSync(AGENTS_PATH, "utf8"));
}
function save(list: AgentRecord[]) {
  writeFileSync(AGENTS_PATH, JSON.stringify(list, null, 2));
}

export interface RegisterInput {
  name?: string;
  capabilities?: string[];
}

export interface RegisterOutput {
  role: string;
  apiToken: string;
  walletAddress: string;
  walletId: string;
  agentId: string;
  fundingURL: string;
  fundingInstructions: string;
  txHash: string;
}

export async function registerNewAgent(input: RegisterInput, walletSetId: string): Promise<RegisterOutput> {
  const existing = load();
  // pick next AGENT_<n> label (skip CREATOR / SMITH_*)
  const usedNumbers = existing
    .map((a) => a.role)
    .filter((r) => r.startsWith(ROLE_PREFIX))
    .map((r) => Number(r.slice(ROLE_PREFIX.length)))
    .filter((n) => Number.isFinite(n));
  const nextN = (usedNumbers.length === 0 ? 1 : Math.max(...usedNumbers) + 1);
  const role = `${ROLE_PREFIX}${nextN}`;
  const displayName = input.name ?? role.toLowerCase();

  // 1. create wallet
  const w = await dcw.createWallets({
    blockchains: ["ARC-TESTNET"] as any,
    count: 1,
    walletSetId,
    accountType: "SCA" as any,
  });
  const wallet = w.data?.wallets?.[0];
  if (!wallet) throw new Error("createWallets returned no wallet");

  // 2. pin metadata
  const meta = {
    name: `agent-foundry/${role.toLowerCase()}`,
    displayName,
    description: `Self-registered agent on Agent Foundry — Arc Testnet`,
    type: "ai-agent",
    version: "1.0.0",
    capabilities: input.capabilities ?? ["general"],
    address: wallet.address,
    schema: "https://arc.network/schemas/erc-8004-agent.json",
  };
  const pin = await pinJSON(`${role.toLowerCase()}.json`, meta);

  // 3. ERC-8004 register
  const tx = await execAndWait({
    walletId: wallet.id!,
    contractAddress: identityAddr,
    abiFunctionSignature: "register(string)",
    abiParameters: [pin.uri],
  });

  // 4. parse Transfer for agentId
  const receipt = await pub.getTransactionReceipt({ hash: tx.txHash as `0x${string}` });
  const transferLogs = parseEventLogs({
    abi: ID_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
  }).filter((l) => l.address.toLowerCase() === identityAddr.toLowerCase());
  const myMint = transferLogs.find((l) =>
    l.args.from === "0x0000000000000000000000000000000000000000" &&
    (l.args.to as string).toLowerCase() === wallet.address!.toLowerCase()
  );
  const agentId = (myMint?.args.tokenId as bigint).toString();

  // 5. issue api token + persist
  const apiToken = "yk_" + randomBytes(20).toString("hex");
  const record: AgentRecord = {
    role,
    walletId: wallet.id!,
    address: wallet.address!,
    agentId,
    tokenURI: pin.uri,
    txHash: tx.txHash,
    registeredAt: new Date().toISOString(),
    apiToken,
    displayName,
  };
  save([...existing, record]);

  // 6. return funding instructions
  return {
    role,
    apiToken,
    walletAddress: wallet.address!,
    walletId: wallet.id!,
    agentId,
    txHash: tx.txHash,
    fundingURL: "https://faucet.circle.com/",
    fundingInstructions: `Open https://faucet.circle.com, select Arc Sepolia (Arc Testnet), paste ${wallet.address}, drip USDC + native. After ~30s your agent is ready.`,
  };
}

export function resolveByToken(token: string): AgentRecord | undefined {
  return load().find((a) => a.apiToken === token);
}
