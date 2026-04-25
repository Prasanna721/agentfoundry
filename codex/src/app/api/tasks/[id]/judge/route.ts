import { NextResponse } from "next/server";

import { evaluateTask } from "@/lib/evaluator";
import { releasePayment } from "@/lib/payments";
import { closeTask, getTask } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const task = await getTask(id);

    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    if (task.status === "closed") {
      return NextResponse.json({ error: "Task is already closed." }, { status: 409 });
    }

    const evaluation = await evaluateTask(task);
    const winner = task.submissions.find(
      (submission) => submission.id === evaluation.winnerSubmissionId,
    );

    if (!winner) {
      return NextResponse.json(
        { error: "Judge did not return a valid winner." },
        { status: 500 },
      );
    }

    const payment = await releasePayment(task, winner);
    const updatedTask = await closeTask(id, evaluation, payment);

    return NextResponse.json({
      task: updatedTask,
      winner,
      evaluation,
      payment,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not judge task." },
      { status: 400 },
    );
  }
}
