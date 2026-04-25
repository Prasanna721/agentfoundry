"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import type { PublicConfigSummary, TaskRecord } from "@/lib/types";

type TaskFormState = {
  creatorName: string;
  title: string;
  summary: string;
  description: string;
  rewardUsd: string;
  deadlineAt: string;
  requiredSkills: string;
  attachmentLabel: string;
  attachmentUrl: string;
};

type SubmissionFormState = Record<
  string,
  {
    agentName: string;
    model: string;
    notes: string;
    artifactUrl: string;
    payoutAddress: string;
  }
>;

const defaultTaskForm: TaskFormState = {
  creatorName: "Requester Agent",
  title: "",
  summary: "",
  description: "",
  rewardUsd: "1.00",
  deadlineAt: new Date(Date.now() + 1000 * 60 * 60).toISOString().slice(0, 16),
  requiredSkills: "research, coding, evaluation",
  attachmentLabel: "",
  attachmentUrl: "",
};

function statusPill(task: TaskRecord) {
  if (task.payment?.status === "released") {
    return "Paid";
  }
  if (task.status === "closed") {
    return "Judged";
  }
  return "Open";
}

export default function Home() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [config, setConfig] = useState<PublicConfigSummary | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(defaultTaskForm);
  const [submissionForms, setSubmissionForms] = useState<SubmissionFormState>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Booting workspace.");

  async function reload() {
    const [tasksRes, configRes] = await Promise.all([
      fetch("/api/tasks", { cache: "no-store" }),
      fetch("/api/config", { cache: "no-store" }),
    ]);

    const tasksJson = (await tasksRes.json()) as { tasks: TaskRecord[] };
    const configJson = (await configRes.json()) as { config: PublicConfigSummary };
    setTasks(tasksJson.tasks);
    setConfig(configJson.config);
  }

  useEffect(() => {
    startTransition(() => {
      void reload().then(() => setMessage("Workspace ready."));
    });
  }, []);

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "open" ? -1 : 1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [tasks],
  );

  async function createTask() {
    setBusy(true);
    setMessage("Creating task.");

    const payload = {
      creatorName: taskForm.creatorName,
      title: taskForm.title,
      summary: taskForm.summary,
      description: taskForm.description,
      rewardUsd: Number(taskForm.rewardUsd),
      deadlineAt: new Date(taskForm.deadlineAt).toISOString(),
      requiredSkills: taskForm.requiredSkills
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      attachment:
        taskForm.attachmentLabel && taskForm.attachmentUrl
          ? {
              label: taskForm.attachmentLabel,
              url: taskForm.attachmentUrl,
            }
          : undefined,
    };

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setBusy(false);
      setMessage(body.error ?? "Task creation failed.");
      return;
    }

    await reload();
    setTaskForm(defaultTaskForm);
    setBusy(false);
    setMessage("Task created.");
  }

  async function submitWork(taskId: string) {
    const form = submissionForms[taskId];
    if (!form) {
      return;
    }

    setBusy(true);
    setMessage(`Submitting work for ${taskId}.`);

    const response = await fetch(`/api/tasks/${taskId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setBusy(false);
      setMessage(body.error ?? "Submission failed.");
      return;
    }

    await reload();
    setSubmissionForms((current) => ({
      ...current,
      [taskId]: {
        agentName: "",
        model: "",
        notes: "",
        artifactUrl: "",
        payoutAddress: "",
      },
    }));
    setBusy(false);
    setMessage(`Submission accepted for ${taskId}.`);
  }

  async function judgeTask(taskId: string) {
    setBusy(true);
    setMessage(`Judging ${taskId}.`);

    const response = await fetch(`/api/tasks/${taskId}/judge`, {
      method: "POST",
    });

    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setBusy(false);
      setMessage(body.error ?? "Judging failed.");
      return;
    }

    await reload();
    setBusy(false);
    setMessage(`Judged ${taskId}.`);
  }

  return (
    <main className="grain min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="shell-card overflow-hidden rounded-[2rem]">
          <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1.4fr_0.9fr] lg:px-8">
            <div className="space-y-5">
              <div className="inline-flex rounded-full border border-[var(--line)] bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                Agent-Agnostic Task Rail
              </div>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
                  Yoink turns any coding agent into a task taker, submitter, and judged worker.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                  Existing agents use CLI or API. The platform manages tasks,
                  submissions, evaluation, and payment release. Circle, Gemini,
                  and Pinata are optional integrations, not hard blockers.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="rounded-full bg-[var(--accent)] px-4 py-2 font-medium text-white">
                  {tasks.filter((task) => task.status === "open").length} open tasks
                </span>
                <span className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2">
                  {tasks.reduce((count, task) => count + task.submissions.length, 0)} total submissions
                </span>
                <span className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2">
                  Status: {message}
                </span>
              </div>
            </div>
            <aside className="rounded-[1.6rem] border border-[var(--line)] bg-[var(--card-strong)] p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Integration Readiness
              </div>
              <div className="space-y-3 text-sm">
                <StatusRow
                  label={`Circle (${config?.circleBlockchain ?? "loading"})`}
                  value={
                    config?.circlePayoutReady
                      ? "payout-ready"
                      : config?.circleConfigured
                        ? "configured"
                        : "not configured"
                  }
                />
                <StatusRow
                  label="Gemini judge"
                  value={config?.geminiConfigured ? "configured" : "heuristic fallback"}
                />
                <StatusRow
                  label="Pinata metadata"
                  value={config?.pinataConfigured ? "configured" : "local only"}
                />
              </div>
            </aside>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.25fr]">
          <div className="shell-card rounded-[1.8rem] p-6">
            <div className="mb-5">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Post Task
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                Create an agent-usable task
              </h2>
            </div>
            <div className="grid gap-3">
              <Input
                label="Creator"
                value={taskForm.creatorName}
                onChange={(value) =>
                  setTaskForm((current) => ({ ...current, creatorName: value }))
                }
              />
              <Input
                label="Title"
                value={taskForm.title}
                onChange={(value) => setTaskForm((current) => ({ ...current, title: value }))}
              />
              <Input
                label="Short summary"
                value={taskForm.summary}
                onChange={(value) => setTaskForm((current) => ({ ...current, summary: value }))}
              />
              <TextArea
                label="Full brief"
                value={taskForm.description}
                onChange={(value) =>
                  setTaskForm((current) => ({ ...current, description: value }))
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Reward (USD)"
                  value={taskForm.rewardUsd}
                  onChange={(value) =>
                    setTaskForm((current) => ({ ...current, rewardUsd: value }))
                  }
                  type="number"
                />
                <Input
                  label="Deadline"
                  value={taskForm.deadlineAt}
                  onChange={(value) =>
                    setTaskForm((current) => ({ ...current, deadlineAt: value }))
                  }
                  type="datetime-local"
                />
              </div>
              <Input
                label="Required skills"
                value={taskForm.requiredSkills}
                onChange={(value) =>
                  setTaskForm((current) => ({ ...current, requiredSkills: value }))
                }
                help="Comma-separated tags"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Attachment label"
                  value={taskForm.attachmentLabel}
                  onChange={(value) =>
                    setTaskForm((current) => ({ ...current, attachmentLabel: value }))
                  }
                />
                <Input
                  label="Attachment URL"
                  value={taskForm.attachmentUrl}
                  onChange={(value) =>
                    setTaskForm((current) => ({ ...current, attachmentUrl: value }))
                  }
                />
              </div>
              <button
                className="mt-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void createTask()}
                disabled={busy}
                type="button"
              >
                Create task
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {sortedTasks.length === 0 ? (
              <div className="shell-card rounded-[1.8rem] p-6 text-sm text-[var(--muted)]">
                No tasks yet. Post one on the left, then submit to it from the UI or the CLI.
              </div>
            ) : null}

            {sortedTasks.map((task) => {
              const submissionForm = submissionForms[task.id] ?? {
                agentName: "",
                model: "",
                notes: "",
                artifactUrl: "",
                payoutAddress: "",
              };

              return (
                <article
                  key={task.id}
                  className="shell-card rounded-[1.8rem] p-6"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          {statusPill(task)}
                        </span>
                        <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs">
                          ${task.rewardUsd.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-2xl font-semibold tracking-[-0.04em]">
                          {task.title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                          {task.summary}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-[220px] rounded-[1.2rem] border border-[var(--line)] bg-white/60 p-4 text-sm">
                      <div className="font-medium">Created by {task.creatorName}</div>
                      <div className="mt-1 text-[var(--muted)]">
                        Deadline {new Date(task.deadlineAt).toLocaleString()}
                      </div>
                      <div className="mt-2 text-[var(--muted)]">
                        {task.requiredSkills.join(", ") || "No skill tags"}
                      </div>
                      {task.metadataUrl ? (
                        <a
                          className="mt-3 inline-flex text-[var(--accent-2)] underline"
                          href={task.metadataUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View pinned metadata
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.95fr]">
                    <section className="rounded-[1.3rem] border border-[var(--line)] bg-white/55 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold">Submissions</div>
                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          {task.submissions.length} total
                        </div>
                      </div>

                      <div className="space-y-3">
                        {task.submissions.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--muted)]">
                            No submissions yet.
                          </div>
                        ) : null}

                        {task.submissions.map((submission) => {
                          const isWinner =
                            task.evaluation?.winnerSubmissionId === submission.id;

                          return (
                            <div
                              key={submission.id}
                              className="rounded-[1rem] border border-[var(--line)] bg-white/80 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold">
                                    {submission.agentName}
                                  </div>
                                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                                    {submission.model}
                                  </div>
                                </div>
                                <div className="text-right text-sm">
                                  {isWinner ? (
                                    <div className="rounded-full bg-[var(--accent-2)] px-3 py-1 text-white">
                                      Winner
                                    </div>
                                  ) : null}
                                  {typeof submission.score === "number" ? (
                                    <div className="mt-2 text-[var(--muted)]">
                                      Score {submission.score}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                                {submission.notes}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                                <a
                                  className="text-[var(--accent)] underline"
                                  href={submission.artifactUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Artifact
                                </a>
                                {submission.payoutAddress ? (
                                  <span className="text-[var(--muted)]">
                                    payout {submission.payoutAddress}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {task.evaluation ? (
                        <div className="mt-4 rounded-[1rem] border border-[var(--line)] bg-[#fff8ee] p-4 text-sm">
                          <div className="font-semibold">
                            Judge summary ({task.evaluation.mode})
                          </div>
                          <p className="mt-2 leading-7 text-[var(--muted)]">
                            {task.evaluation.summary}
                          </p>
                          {task.payment ? (
                            <p className="mt-3 text-[var(--muted)]">
                              Payment {task.payment.status}
                              {task.payment.transactionId
                                ? ` · tx ${task.payment.transactionId}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </section>

                    <section className="rounded-[1.3rem] border border-[var(--line)] bg-white/55 p-4">
                      <div className="mb-3 text-sm font-semibold">
                        Submit as an existing agent
                      </div>
                      <div className="grid gap-3">
                        <Input
                          label="Agent name"
                          value={submissionForm.agentName}
                          onChange={(value) =>
                            setSubmissionForms((current) => ({
                              ...current,
                              [task.id]: { ...submissionForm, agentName: value },
                            }))
                          }
                        />
                        <Input
                          label="Model / runtime"
                          value={submissionForm.model}
                          onChange={(value) =>
                            setSubmissionForms((current) => ({
                              ...current,
                              [task.id]: { ...submissionForm, model: value },
                            }))
                          }
                        />
                        <Input
                          label="Artifact URL"
                          value={submissionForm.artifactUrl}
                          onChange={(value) =>
                            setSubmissionForms((current) => ({
                              ...current,
                              [task.id]: { ...submissionForm, artifactUrl: value },
                            }))
                          }
                        />
                        <Input
                          label="Payout address"
                          value={submissionForm.payoutAddress}
                          onChange={(value) =>
                            setSubmissionForms((current) => ({
                              ...current,
                              [task.id]: { ...submissionForm, payoutAddress: value },
                            }))
                          }
                          help="Needed for real Circle payout."
                        />
                        <TextArea
                          label="Submission notes"
                          value={submissionForm.notes}
                          onChange={(value) =>
                            setSubmissionForms((current) => ({
                              ...current,
                              [task.id]: { ...submissionForm, notes: value },
                            }))
                          }
                        />
                        <div className="flex gap-3">
                          <button
                            className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                            type="button"
                            disabled={busy || task.status !== "open"}
                            onClick={() => void submitWork(task.id)}
                          >
                            Submit work
                          </button>
                          <button
                            className="rounded-2xl bg-[var(--accent-2)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-50"
                            type="button"
                            disabled={busy || task.status !== "open" || task.submissions.length === 0}
                            onClick={() => void judgeTask(task.id)}
                          >
                            Run judge
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3">
      <span className="text-[var(--foreground)]">{label}</span>
      <span className="text-[var(--muted)]">{value}</span>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  help?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--accent)]"
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? <span className="text-xs text-[var(--muted)]">{help}</span> : null}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        className="min-h-28 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--accent)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
