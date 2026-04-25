import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  Blockchain,
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
const envLocalPath = path.join(process.cwd(), ".env.local");
const outputDir = path.join(process.cwd(), "output");

function appendEnvLines(lines: Record<string, string>) {
  const block = Object.entries(lines)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  return writeFile(envLocalPath, `\n${block}\n`, { flag: "a" });
}

async function main() {
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY is required in .env.local before bootstrapping.");
  }

  await mkdir(outputDir, { recursive: true });

  let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!entitySecret) {
    entitySecret = crypto.randomBytes(32).toString("hex");
    await registerEntitySecretCiphertext({
      apiKey,
      entitySecret,
      recoveryFileDownloadPath: outputDir,
    });

    await appendEnvLines({
      CIRCLE_ENTITY_SECRET: entitySecret,
    });
  }

  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  });

  const walletSetResponse = await client.createWalletSet({
    name: `Yoink Wallet Set ${new Date().toISOString()}`,
  });

  const walletSetId = walletSetResponse.data?.walletSet?.id;
  if (!walletSetId) {
    throw new Error("Circle did not return a wallet set id.");
  }

  const walletsResponse = await client.createWallets({
    accountType: "EOA",
    count: 4,
    blockchains: [Blockchain.ArcTestnet],
    walletSetId,
  });

  const wallets = walletsResponse.data?.wallets ?? [];
  await writeFile(
    path.join(process.cwd(), "circle-wallets.json"),
    JSON.stringify(
      {
        walletSetId,
        wallets,
      },
      null,
      2,
    ),
    "utf8",
  );

  if (wallets[0]?.id) {
    await appendEnvLines({
      CIRCLE_WALLET_SET_ID: walletSetId,
      CIRCLE_PAYER_WALLET_ID: wallets[0].id,
      CIRCLE_PAYER_WALLET_ADDRESS: wallets[0].address,
      CIRCLE_BLOCKCHAIN: Blockchain.ArcTestnet,
      YOINK_WALLET_SET_ID: walletSetId,
      YOINK_WALLET_CREATOR: wallets[0].address,
      YOINK_WALLET_AGENT_1: wallets[1]?.address ?? "",
      YOINK_WALLET_AGENT_2: wallets[2]?.address ?? "",
      YOINK_WALLET_AGENT_3: wallets[3]?.address ?? "",
      YOINK_WALLET_VALIDATOR: wallets[0].address,
    });
  }

  console.log(
    JSON.stringify(
      {
        walletSetId,
        wallets: wallets.map((wallet) => ({
          id: wallet.id,
          address: wallet.address,
          blockchain: wallet.blockchain,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
