import type { PublicConfigSummary } from "@/lib/types";

export const ARC_TESTNET_USDC =
  process.env.ARC_TESTNET_USDC_ADDRESS ??
  "0x3600000000000000000000000000000000000000";

export const env = {
  circleApiKey: process.env.CIRCLE_API_KEY,
  circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET,
  circlePayerWalletId: process.env.CIRCLE_PAYER_WALLET_ID,
  circlePayerWalletAddress: process.env.CIRCLE_PAYER_WALLET_ADDRESS,
  circleBlockchain: process.env.CIRCLE_BLOCKCHAIN ?? "ARC-TESTNET",
  circleUsdcTokenAddress: process.env.CIRCLE_USDC_TOKEN_ADDRESS ?? ARC_TESTNET_USDC,
  geminiApiKey: process.env.GEMINI_API_KEY,
  pinataJwt: process.env.PINATA_JWT,
  pinataApiKey: process.env.PINATA_API_KEY,
  pinataApiSecret: process.env.PINATA_API_SECRET,
};

export function getPublicConfigSummary(): PublicConfigSummary {
  return {
    circleConfigured: Boolean(env.circleApiKey && env.circleEntitySecret),
    circlePayoutReady: Boolean(
      env.circleApiKey &&
        env.circleEntitySecret &&
        (env.circlePayerWalletId || env.circlePayerWalletAddress),
    ),
    geminiConfigured: Boolean(env.geminiApiKey),
    pinataConfigured: Boolean(
      env.pinataJwt || (env.pinataApiKey && env.pinataApiSecret),
    ),
    circleBlockchain: env.circleBlockchain,
  };
}
