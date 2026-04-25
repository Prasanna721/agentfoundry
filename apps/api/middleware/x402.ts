/**
 * x402 paywall middleware (Hono).
 *
 * Implements the x402 protocol shape per https://www.x402.org/:
 *   - On the FIRST request, server returns 402 with `accepts` describing
 *     payment options (asset, amount, recipient, network, scheme).
 *   - Client signs EIP-3009 transferWithAuthorization for the requested
 *     amount and retries with X-PAYMENT: <base64(json)> header.
 *   - Server verifies via a facilitator (or accepts the signature for
 *     local dev), then returns 200 with the resource.
 *
 * For the hackathon demo we operate in two modes:
 *   - "challenge"   — always issue 402 unless X-PAYMENT is present;
 *                     accept any non-empty X-PAYMENT (proves protocol shape).
 *   - "facilitator" — verify X-PAYMENT against a real facilitator URL
 *                     (Circle Nanopayments / x402.org). Set
 *                     X402_FACILITATOR_URL to enable.
 *
 * Smith subprocesses include the X-PAYMENT header automatically (built
 * via signX402Payment), so the demo keeps running while showing the
 * full protocol round-trip on every paywalled call.
 */

import type { Context, MiddlewareHandler } from "hono";

export interface PaywallSpec {
  /** Price in USDC (decimal string, e.g. "0.001"). */
  price: string;
  /** ERC-20 token address (USDC on Arc Testnet by default). */
  asset?: `0x${string}`;
  /** Recipient address — the protocol treasury wallet. */
  recipient: `0x${string}`;
  /** Network identifier (per x402 spec). */
  network?: string;
}

const DEFAULT_ASSET = (process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000") as `0x${string}`;
const NETWORK       = process.env.X402_NETWORK || "arc-testnet";

export function paywall(spec: PaywallSpec): MiddlewareHandler {
  return async (c: Context, next) => {
    const proof = c.req.header("X-PAYMENT");
    if (!proof) {
      // Issue 402.
      const challenge = {
        x402Version: 1,
        accepts: [{
          scheme: "exact",
          network: NETWORK,
          maxAmountRequired: usdcMicroFromDecimal(spec.price),
          asset: spec.asset ?? DEFAULT_ASSET,
          payTo: spec.recipient,
          resource: c.req.url,
          description: `Pay ${spec.price} USDC to call ${c.req.method} ${new URL(c.req.url).pathname}`,
          mimeType: "application/json",
          maxTimeoutSeconds: 120,
          // Per x402: extra fields specific to the scheme go here.
          extra: { protocol: "agent-foundry", apiVersion: "v1" },
        }],
      };
      return c.json(challenge, 402, { "Content-Type": "application/json" });
    }

    // Optional facilitator verification.
    const facilitator = process.env.X402_FACILITATOR_URL;
    if (facilitator) {
      try {
        const r = await fetch(`${facilitator}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentPayload: JSON.parse(Buffer.from(proof, "base64").toString("utf8")) }),
        });
        if (!r.ok) return c.json({ error: "facilitator rejected payment", status: r.status }, 402);
      } catch (e: any) {
        return c.json({ error: "facilitator unreachable", detail: e.message }, 502);
      }
    }

    // Mark request paid for downstream handlers.
    c.set("x402:paid", true);
    c.set("x402:price", spec.price);
    return next();
  };
}

/** Convert "0.005" → "5000" (USDC has 6 decimals, but x402 uses smallest unit). */
function usdcMicroFromDecimal(s: string): string {
  const [whole, frac = ""] = s.split(".");
  const padded = (frac + "000000").slice(0, 6);
  return BigInt(whole + padded).toString();
}
