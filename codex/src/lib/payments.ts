import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { nanoid } from "nanoid";

import { env } from "@/lib/env";
import type { PaymentRecord, SubmissionRecord, TaskRecord } from "@/lib/types";

function getCircleClient() {
  if (!env.circleApiKey || !env.circleEntitySecret) {
    return null;
  }

  return initiateDeveloperControlledWalletsClient({
    apiKey: env.circleApiKey,
    entitySecret: env.circleEntitySecret,
  });
}

export async function releasePayment(task: TaskRecord, winner: SubmissionRecord) {
  const basePayment: PaymentRecord = {
    status: "simulated",
    amountUsd: task.rewardUsd,
    mode: "simulated",
    recipient: winner.payoutAddress,
    createdAt: new Date().toISOString(),
  };

  const client = getCircleClient();
  if (!client || !env.circlePayerWalletAddress || !winner.payoutAddress) {
    return basePayment;
  }

  try {
    const response = await Promise.race([
      client.createTransaction({
        walletAddress: env.circlePayerWalletAddress,
        destinationAddress: winner.payoutAddress,
        amount: [task.rewardUsd.toFixed(2)],
        tokenAddress: env.circleUsdcTokenAddress,
        blockchain: "ARC-TESTNET" as const,
        fee: {
          type: "level",
          config: {
            feeLevel: "MEDIUM",
          },
        },
        idempotencyKey: `yoink-${task.id}-${winner.id}-${nanoid(6)}`,
        refId: `yoink:${task.id}`,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Circle payout timed out.")), 15000);
      }),
    ]);

    return {
      status: "released",
      amountUsd: task.rewardUsd,
      mode: "circle",
      recipient: winner.payoutAddress,
      transactionId: response.data?.id,
      createdAt: new Date().toISOString(),
    } satisfies PaymentRecord;
  } catch (error) {
    return {
      status: "failed",
      amountUsd: task.rewardUsd,
      mode: "circle",
      recipient: winner.payoutAddress,
      error: error instanceof Error ? error.message : "Circle payout failed",
      createdAt: new Date().toISOString(),
    } satisfies PaymentRecord;
  }
}
