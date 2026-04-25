import { NextResponse } from "next/server";

import { settleExpiredTasks } from "@/lib/automation";
import { getTask } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await settleExpiredTasks();
  const { id } = await context.params;
  const task = await getTask(id);

  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  return NextResponse.json({ task });
}
