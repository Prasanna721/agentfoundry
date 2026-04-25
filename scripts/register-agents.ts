/**
 * Register each role wallet as an agent in ERC-8004 IdentityRegistry on
 * Arc Testnet.
 *
 * Per role:
 *   1. Pin a metadata JSON to Pinata (IPFS) describing the agent.
 *   2. Call IdentityRegistry.register(metadataURI) via Circle DCW from
 *      that role's wallet.
 *   3. Wait for confirmation, parse logs for the ERC-721 Transfer event
 *      from the zero address — that gives us the agentId (token id).
 *   4. Verify with cast call: ownerOf(agentId) == role wallet.
 *   5. Persist {role, walletId, address, agentId, tokenURI, txHash}
 *      into data/agents.json.
 *
 * Idempotent: if data/agents.json already has an entry for a role with
 * an on-chain agentId still owned by that wallet, it skips.
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, parseAbi, parseEventLogs, type Log, decodeEventLog } from "viem";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const apiKey       = process.env.CIRCLE_API_KEY!;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
const pinataJwt    = process.env.PINATA_JWT!;
const identityAddr = (process.env.ERC_8004_IDENTITY || "0x8004A818BFB912233c491871b3d84c89A494BD9e") as `0x${string}`;
const rpc          = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network/";

const AGENTS_PATH = join(process.cwd(), "data", "agents.json");

const ROLES = ["CREATOR", "SMITH_1", "SMITH_2", "SMITH_3"] as const;
type Role = typeof ROLES[number];

if (!apiKey || !entitySecret || !pinataJwt) {
  console.error("✖ need CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, PINATA_JWT");
  process.exit(1);
}

const dcw = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const pub = createPublicClient({ transport: http(rpc) });

const ID_ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function register(string)",
]);

interface AgentRecord {
  role: Role;
  walletId: string;
  address: string;
  agentId: string;     // tokenId as decimal string
  tokenURI: string;
  txHash: string;
  registeredAt: string;
}

function loadAgents(): AgentRecord[] {
  if (!existsSync(AGENTS_PATH)) return [];
  return JSON.parse(readFileSync(AGENTS_PATH, "utf8"));
}
function saveAgents(rs: AgentRecord[]) {
  mkdirSync(dirname(AGENTS_PATH), { recursive: true });
  writeFileSync(AGENTS_PATH, JSON.stringify(rs, null, 2));
}

async function pinMetadata(role: Role, address: string): Promise<string> {
  const meta = {
    name: `agent-yoink/${role.toLowerCase()}`,
    description: `Agent ${role} on Agent Foundry — multi-bidder USDC task marketplace on Arc Testnet`,
    type: "ai-agent",
    version: "1.0.0",
    image: "ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei",
    capabilities: role === "CREATOR" ? ["task-creation", "evaluation"] : ["code", "research"],
    address,
    schema: "https://arc.network/schemas/erc-8004-agent.json",
  };
  const r = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${pinataJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      pinataContent: meta,
      pinataMetadata: { name: `agent-yoink-${role.toLowerCase()}.json` },
    }),
  });
  if (!r.ok) throw new Error(`pinata: ${r.status} ${await r.text()}`);
  const j = await r.json() as { IpfsHash: string };
  return `ipfs://${j.IpfsHash}`;
}

async function registerOne(role: Role): Promise<AgentRecord> {
  const walletId = process.env[`WALLET_${role}_ID`]!;
  const address  = process.env[`WALLET_${role}_ADDRESS`]! as `0x${string}`;
  if (!walletId || !address) throw new Error(`missing WALLET_${role}_*`);

  console.log(`\n▸ ${role}  wallet=${walletId}  address=${address}`);

  // 1. pin metadata
  const tokenURI = await pinMetadata(role, address);
  console.log(`  pinned: ${tokenURI}`);

  // 2. register
  const tx = await dcw.createContractExecutionTransaction({
    walletId,
    contractAddress: identityAddr,
    abiFunctionSignature: "register(string)",
    abiParameters: [tokenURI],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const txId = tx.data?.id;
  console.log(`  tx queued: ${txId}`);

  // 3. wait for confirmation
  let txHash: string | undefined;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const t = (await dcw.getTransaction({ id: txId! })).data?.transaction;
    process.stdout.write(`\r  [${new Date().toISOString().slice(11, 19)}] ${t?.state ?? "?"}  ${t?.txHash?.slice(0, 14) ?? ""}…   `);
    if (t?.state === "CONFIRMED" || t?.state === "COMPLETE") {
      txHash = t.txHash!;
      process.stdout.write("\n");
      break;
    }
    if (t?.state === "FAILED" || t?.state === "DENIED" || t?.state === "CANCELED") {
      process.stdout.write("\n");
      throw new Error(`tx ${t?.state}: ${JSON.stringify(t)}`);
    }
  }
  if (!txHash) throw new Error("tx did not confirm in 100s");

  // 4. fetch receipt + parse Transfer event
  const receipt = await pub.getTransactionReceipt({ hash: txHash as `0x${string}` });
  const transferLogs = parseEventLogs({
    abi: ID_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
  }).filter((l) => l.address.toLowerCase() === identityAddr.toLowerCase());

  const myMint = transferLogs.find((l) =>
    l.args.from === "0x0000000000000000000000000000000000000000" &&
    (l.args.to as string).toLowerCase() === address.toLowerCase()
  );
  if (!myMint) throw new Error(`no mint Transfer to ${address} in receipt ${txHash}`);

  const agentId = (myMint.args.tokenId as bigint).toString();
  console.log(`  agentId: ${agentId}`);

  // 5. real validation: ownerOf + tokenURI
  const owner = await pub.readContract({ address: identityAddr, abi: ID_ABI, functionName: "ownerOf", args: [BigInt(agentId)] });
  const uri   = await pub.readContract({ address: identityAddr, abi: ID_ABI, functionName: "tokenURI", args: [BigInt(agentId)] });
  if ((owner as string).toLowerCase() !== address.toLowerCase()) {
    throw new Error(`ownerOf(${agentId}) = ${owner}, expected ${address}`);
  }
  console.log(`  ✓ verified  ownerOf=${owner}  tokenURI=${uri}`);

  return {
    role,
    walletId,
    address,
    agentId,
    tokenURI: uri as string,
    txHash,
    registeredAt: new Date().toISOString(),
  };
}

const existing = loadAgents();
const out: AgentRecord[] = [];
for (const role of ROLES) {
  const prior = existing.find((e) => e.role === role);
  if (prior) {
    // Verify the on-chain state still matches.
    try {
      const owner = await pub.readContract({ address: identityAddr, abi: ID_ABI, functionName: "ownerOf", args: [BigInt(prior.agentId)] });
      if ((owner as string).toLowerCase() === prior.address.toLowerCase()) {
        console.log(`▸ ${role}: already registered (agentId ${prior.agentId}), skipping`);
        out.push(prior);
        continue;
      }
    } catch (_) { /* fall through and re-register */ }
  }
  out.push(await registerOne(role));
  saveAgents(out.concat(existing.filter((e) => !out.some((o) => o.role === e.role))));
}

saveAgents(out);
console.log("\n✓ all agents registered. data/agents.json:");
console.log(JSON.stringify(out, null, 2));
