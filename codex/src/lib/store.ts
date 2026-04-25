import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import { pinTaskMetadata } from "@/lib/pinata";
import type {
  AppState,
  EvaluationRecord,
  PaymentRecord,
  SubmissionRecord,
  TaskRecord,
} from "@/lib/types";

const dataDir = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDir, "yoink.json");

const initialState: AppState = { tasks: [] };
let mutationQueue: Promise<unknown> = Promise.resolve();

async function ensureStateFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify(initialState, null, 2), "utf8");
  }
}

async function readState(): Promise<AppState> {
  await ensureStateFile();
  const raw = await readFile(dataFile, "utf8");
  return JSON.parse(raw) as AppState;
}

async function writeState(state: AppState) {
  await writeFile(dataFile, JSON.stringify(state, null, 2), "utf8");
}

async function mutateState<T>(mutator: (state: AppState) => Promise<T> | T) {
  const run = mutationQueue.then(async () => {
    const state = await readState();
    const result = await mutator(state);
    await writeState(state);
    return result;
  });

  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

export async function listTasks() {
  const state = await readState();
  return state.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTask(taskId: string) {
  const state = await readState();
  return state.tasks.find((task) => task.id === taskId) ?? null;
}

interface CreateTaskInput {
  creatorName: string;
  title: string;
  summary: string;
  description: string;
  rewardUsd: number;
  deadlineAt: string;
  requiredSkills: string[];
  attachment?: { label: string; url: string };
}

export async function createTask(input: CreateTaskInput) {
  return mutateState(async (state) => {
    const task: TaskRecord = {
      id: `task_${nanoid(10)}`,
      creatorName: input.creatorName,
      title: input.title,
      summary: input.summary,
      description: input.description,
      rewardUsd: input.rewardUsd,
      deadlineAt: input.deadlineAt,
      requiredSkills: input.requiredSkills,
      attachment: input.attachment,
      createdAt: new Date().toISOString(),
      status: "open",
      submissions: [],
    };

    try {
      const cid = await pinTaskMetadata({
        id: task.id,
        title: task.title,
        creatorName: task.creatorName,
        summary: task.summary,
        description: task.description,
        rewardUsd: task.rewardUsd,
        deadlineAt: task.deadlineAt,
        requiredSkills: task.requiredSkills,
        attachment: task.attachment,
        createdAt: task.createdAt,
      });

      if (cid) {
        task.metadataCid = cid;
        task.metadataUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
      }
    } catch {
      // Pinning is optional for the MVP; task creation should still succeed.
    }

    state.tasks.push(task);
    return task;
  });
}

interface SubmissionInput {
  agentName: string;
  model: string;
  notes: string;
  artifactUrl: string;
  payoutAddress?: string;
}

export async function addSubmission(taskId: string, input: SubmissionInput) {
  return mutateState(async (state) => {
    const task = state.tasks.find((entry) => entry.id === taskId);

    if (!task) {
      throw new Error("Task not found.");
    }

    if (task.status !== "open") {
      throw new Error("Task is already closed.");
    }

    const submission: SubmissionRecord = {
      id: `sub_${nanoid(10)}`,
      taskId,
      agentName: input.agentName,
      model: input.model,
      notes: input.notes,
      artifactUrl: input.artifactUrl,
      payoutAddress: input.payoutAddress,
      createdAt: new Date().toISOString(),
    };

    task.submissions.push(submission);
    return submission;
  });
}

export async function closeTask(
  taskId: string,
  evaluation: EvaluationRecord,
  payment: PaymentRecord,
) {
  return mutateState(async (state) => {
    const task = state.tasks.find((entry) => entry.id === taskId);

    if (!task) {
      throw new Error("Task not found.");
    }

    task.status = "closed";
    task.evaluation = evaluation;
    task.payment = payment;

    task.submissions = task.submissions.map((submission) => {
      const match = evaluation.rubric.find((item) => item.submissionId === submission.id);
      return {
        ...submission,
        score: match?.score,
      };
    });

    return task;
  });
}
