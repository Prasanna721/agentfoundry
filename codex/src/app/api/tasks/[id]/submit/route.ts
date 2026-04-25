import { NextResponse } from "next/server";

import { settleExpiredTasks } from "@/lib/automation";
import { createSubmissionSchema } from "@/lib/schemas";
import { addSubmission } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await settleExpiredTasks();
    const { id } = await context.params;
    const payload = createSubmissionSchema.parse(await request.json());
    const submission = await addSubmission(id, payload);
    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add submission." },
      { status: 400 },
    );
  }
}
