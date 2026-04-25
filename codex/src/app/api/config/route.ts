import { NextResponse } from "next/server";

import { getPublicConfigSummary } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    config: getPublicConfigSummary(),
  });
}
