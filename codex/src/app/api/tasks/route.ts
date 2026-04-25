import { NextResponse } from "next/server";

import { settleExpiredTasks } from "@/lib/automation";
import { createTask, listTasks } from "@/lib/store";
import { createTaskSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  await settleExpiredTasks();
  const tasks = await listTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  try {
    const payload = createTaskSchema.parse(await request.json());
    const task = await createTask(payload);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create task." },
      { status: 400 },
    );
  }
}
