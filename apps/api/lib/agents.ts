import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface AgentRecord {
  role: string;
  walletId: string;
  address: string;
  agentId: string;
  tokenURI: string;
  txHash: string;
  registeredAt: string;
}

const PATH = join(process.cwd(), "data", "agents.json");

let cache: AgentRecord[] | null = null;
export function loadAgents(): AgentRecord[] {
  if (cache) return cache;
  cache = JSON.parse(readFileSync(PATH, "utf8")) as AgentRecord[];
  return cache;
}

export function byRole(role: string): AgentRecord {
  const a = loadAgents().find((x) => x.role.toUpperCase() === role.toUpperCase());
  if (!a) throw new Error(`no agent for role ${role}`);
  return a;
}

export function byAddress(addr: string): AgentRecord | undefined {
  return loadAgents().find((x) => x.address.toLowerCase() === addr.toLowerCase());
}
