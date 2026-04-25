import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface AgentRecord {
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

const PATH = join(process.cwd(), "data", "agents.json");

export function loadAgents(): AgentRecord[] {
  // Always re-read — the registration endpoint writes to this file and we
  // want subsequent calls to see the new agent without a process restart.
  if (!existsSync(PATH)) {
    mkdirSync(dirname(PATH), { recursive: true });
    writeFileSync(PATH, "[]");
    return [];
  }
  try {
    return JSON.parse(readFileSync(PATH, "utf8")) as AgentRecord[];
  } catch (_) {
    return [];
  }
}

export function byRole(role: string): AgentRecord {
  const a = loadAgents().find((x) => x.role.toUpperCase() === role.toUpperCase());
  if (!a) throw new Error(`no agent for role ${role}`);
  return a;
}

export function byAddress(addr: string): AgentRecord | undefined {
  return loadAgents().find((x) => x.address.toLowerCase() === addr.toLowerCase());
}
