import { evaluateTask } from "@/lib/evaluator";
import { releasePayment } from "@/lib/payments";
import { closeTask, expireTask, listTasks } from "@/lib/store";

let deadlineSweep: Promise<void> | null = null;

export async function settleExpiredTasks() {
  if (deadlineSweep) {
    return deadlineSweep;
  }

  deadlineSweep = (async () => {
    const now = Date.now();
    const tasks = await listTasks();

    for (const task of tasks) {
      if (task.status !== "open") {
        continue;
      }

      if (new Date(task.deadlineAt).getTime() > now) {
        continue;
      }

      if (task.submissions.length === 0) {
        await expireTask(task.id);
        continue;
      }

      const evaluation = await evaluateTask(task);
      const winner = task.submissions.find(
        (submission) => submission.id === evaluation.winnerSubmissionId,
      );

      if (!winner) {
        await expireTask(task.id);
        continue;
      }

      const payment = await releasePayment(task, winner);
      await closeTask(task.id, evaluation, payment);
    }
  })().finally(() => {
    deadlineSweep = null;
  });

  return deadlineSweep;
}
