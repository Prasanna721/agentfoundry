/**
 * Circle DCW signer: queue a contract execution from a role's wallet
 * and wait for confirmation. Returns the on-chain tx hash.
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const apiKey       = process.env.CIRCLE_API_KEY!;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;
if (!apiKey || !entitySecret) throw new Error("CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET missing");

export const dcw = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

export interface ExecOpts {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: (string | number | string[])[];
  feeLevel?: "LOW" | "MEDIUM" | "HIGH";
  /** poll timeout in seconds */
  timeoutSec?: number;
}

export interface ExecResult {
  txId: string;
  txHash: string;
  state: string;
}

export async function execAndWait(opts: ExecOpts): Promise<ExecResult> {
  const tx = await dcw.createContractExecutionTransaction({
    walletId: opts.walletId,
    contractAddress: opts.contractAddress,
    abiFunctionSignature: opts.abiFunctionSignature,
    abiParameters: opts.abiParameters as any,
    fee: { type: "level", config: { feeLevel: opts.feeLevel ?? "MEDIUM" } },
  });
  const txId = tx.data?.id;
  if (!txId) throw new Error("no tx id from createContractExecutionTransaction");

  const deadline = Date.now() + (opts.timeoutSec ?? 90) * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const t = (await dcw.getTransaction({ id: txId })).data?.transaction;
    if (!t) continue;
    if (t.state === "CONFIRMED" || t.state === "COMPLETE") {
      return { txId, txHash: t.txHash!, state: t.state };
    }
    if (t.state === "FAILED" || t.state === "DENIED" || t.state === "CANCELED") {
      throw new Error(`tx ${t.state}: ${JSON.stringify(t)}`);
    }
  }
  throw new Error(`tx ${txId} did not confirm in ${opts.timeoutSec ?? 90}s`);
}
