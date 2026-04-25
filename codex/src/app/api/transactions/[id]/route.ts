import { NextResponse } from "next/server";

import { getPaymentTransaction } from "@/lib/payments";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const transaction = await getPaymentTransaction(id);

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load transaction." },
      { status: 400 },
    );
  }
}
