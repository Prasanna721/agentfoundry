"use client";

import type { ReactNode } from "react";
import { startTransition, useEffect, useState } from "react";

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

type TransactionView = {
  id: string;
  state: string | null;
  txHash: string | null;
  blockchain: string | null;
  sourceAddress: string | null;
  destinationAddress: string | null;
  createDate: string | null;
  updateDate: string | null;
};

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

function emptySubmissionForm() {
  return {
    agentName: "",
    model: "",
    notes: "",
    artifactUrl: "",
    payoutAddress: "",
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

function shortAddress(value: string | undefined) {
  if (!value) {
    return "Not set";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function taskStatusLabel(task: TaskRecord) {
  if (task.status === "expired") {
    return "Expired";
  }

  if (task.payment?.status === "released") {
    return "Paid";
  }

  if (task.status === "closed") {
    return "Judged";
  }

  return "Open";
}

function taskStatusTone(task: TaskRecord) {
  if (task.status === "expired") {
    return "border-[#a5392b]/20 bg-[#fff1ef] text-[#a5392b]";
  }

  if (task.payment?.status === "released") {
    return "border-[#1e6b5e]/20 bg-[#ebfff8] text-[#1e6b5e]";
  }

  if (task.status === "closed") {
    return "border-[var(--line)] bg-white text-[var(--foreground)]";
  }

  return "border-[#d05f2d]/20 bg-[#fff3ea] text-[#d05f2d]";
}

export default function Home() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [config, setConfig] = useState<PublicConfigSummary | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(defaultTaskForm);
  const [submissionForms, setSubmissionForms] = useState<SubmissionFormState>({});
  const [transaction, setTransaction] = useState<TransactionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading workspace.");

  async function reload() {
    const [tasksRes, configRes] = await Promise.all([
      fetch("/api/tasks", { cache: "no-store" }),
      fetch("/api/config", { cache: "no-store" }),
    ]);

    const tasksJson = (await tasksRes.json()) as { tasks: TaskRecord[] };
    const configJson = (await configRes.json()) as { config: PublicConfigSummary };

    setTasks(tasksJson.tasks);
    setConfig(configJson.config);
    setSelectedTaskId((current) => {
      if (current && tasksJson.tasks.some((task) => task.id === current)) {
        return current;
      }

      return tasksJson.tasks[0]?.id ?? null;
    });
  }

  useEffect(() => {
    let cancelled = false;

    const runReload = () => {
      startTransition(() => {
        void reload()
          .then(() => {
            if (!cancelled) {
              setMessage("Workspace ready.");
            }
          })
          .catch((error) => {
            if (!cancelled) {
              setMessage(error instanceof Error ? error.message : "Reload failed.");
            }
          });
      });
    };

    runReload();
    const timer = setInterval(runReload, 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadTransaction() {
      if (!selectedTask?.payment?.transactionId) {
        setTransaction(null);
        return;
      }

      const response = await fetch(
        `/api/transactions/${selectedTask.payment.transactionId}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        setTransaction(null);
        return;
      }

      const body = (await response.json()) as { transaction: TransactionView };
      if (!cancelled) {
        setTransaction(body.transaction);
      }
    }

    void loadTransaction();

    return () => {
      cancelled = true;
    };
  }, [selectedTask?.payment?.transactionId]);

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

    const body = (await response.json()) as { error?: string; task?: TaskRecord };
    if (!response.ok) {
      setBusy(false);
      setMessage(body.error ?? "Task creation failed.");
      return;
    }

    await reload();
    if (body.task?.id) {
      setSelectedTaskId(body.task.id);
    }
    setTaskForm(defaultTaskForm);
    setBusy(false);
    setMessage("Task created and metadata pinned if Pinata is configured.");
  }

  async function submitWork(taskId: string) {
    const form = submissionForms[taskId] ?? emptySubmissionForm();

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
      [taskId]: emptySubmissionForm(),
    }));
    setBusy(false);
    setMessage("Submission accepted.");
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
    setMessage("Judge completed.");
  }

  const paymentTasks = tasks.filter((task) => task.payment);
  const openTasks = tasks.filter((task) => task.status === "open");
  const totalSubmissions = tasks.reduce((count, task) => count + task.submissions.length, 0);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="shell-card rounded-[1.75rem] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                Yoink
              </div>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Agent tasks, judged results, and Circle payouts without a custom agent runtime.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                Existing agents submit a result URL and notes. Task metadata pins at creation,
                deadlines can auto-settle on refresh, and Circle payouts run when the winner is chosen.
                Escrow is not implemented in this MVP.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[340px]">
              <Metric label="Open tasks" value={String(openTasks.length)} />
              <Metric label="Payments" value={String(paymentTasks.length)} />
              <Metric label="Submissions" value={String(totalSubmissions)} />
              <Metric label="Status" value={message} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <section className="shell-card rounded-[1.5rem] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                    Tasks
                  </div>
                  <h2 className="mt-1 text-xl font-semibold">Task board</h2>
                </div>
                <div className="text-sm text-[var(--muted)]">{tasks.length} total</div>
              </div>

              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--muted)]">
                    No tasks yet.
                  </div>
                ) : null}

                {tasks.map((task) => {
                  const selected = task.id === selectedTask?.id;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={`block w-full rounded-[1.2rem] border p-4 text-left transition ${
                        selected
                          ? "border-[var(--accent)] bg-[#fff5ee]"
                          : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
                      }`}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{task.title}</div>
                          <div className="mt-1 text-sm text-[var(--muted)]">{task.summary}</div>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${taskStatusTone(task)}`}
                        >
                          {taskStatusLabel(task)}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-3">
                        <span>${task.rewardUsd.toFixed(2)}</span>
                        <span>{task.submissions.length} submissions</span>
                        <span>{formatDate(task.deadlineAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="shell-card rounded-[1.5rem] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Integration readiness
              </div>
              <div className="mt-3 grid gap-3 text-sm">
                <KeyCard
                  label="Circle"
                  value={
                    config?.circlePayoutReady
                      ? `Payout-ready on ${config.circleBlockchain}`
                      : config?.circleConfigured
                        ? `Configured on ${config.circleBlockchain}`
                        : "Not configured"
                  }
                />
                <KeyCard
                  label="Gemini"
                  value={config?.geminiConfigured ? "Configured" : "Heuristic fallback"}
                />
                <KeyCard
                  label="Pinata"
                  value={config?.pinataConfigured ? "Configured" : "Local-only metadata"}
                />
              </div>
            </section>

            <section className="shell-card rounded-[1.5rem] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Post task
              </div>
              <h2 className="mt-1 text-xl font-semibold">Create a task</h2>

              <div className="mt-4 grid gap-3">
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
                    type="number"
                    value={taskForm.rewardUsd}
                    onChange={(value) =>
                      setTaskForm((current) => ({ ...current, rewardUsd: value }))
                    }
                  />
                  <Input
                    label="Deadline"
                    type="datetime-local"
                    value={taskForm.deadlineAt}
                    onChange={(value) =>
                      setTaskForm((current) => ({ ...current, deadlineAt: value }))
                    }
                  />
                </div>
                <Input
                  label="Required skills"
                  value={taskForm.requiredSkills}
                  onChange={(value) =>
                    setTaskForm((current) => ({ ...current, requiredSkills: value }))
                  }
                  help="Comma-separated tags for the judge and workers."
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
                  className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void createTask()}
                  disabled={busy}
                  type="button"
                >
                  Create task
                </button>
              </div>
            </section>
          </aside>

          <div className="space-y-6">
            {selectedTask ? (
              <>
                <section className="shell-card rounded-[1.5rem] p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${taskStatusTone(selectedTask)}`}
                        >
                          {taskStatusLabel(selectedTask)}
                        </span>
                        <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs">
                          ${selectedTask.rewardUsd.toFixed(2)}
                        </span>
                        <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs">
                          {selectedTask.submissions.length} submissions
                        </span>
                      </div>
                      <div>
                        <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                          {selectedTask.title}
                        </h2>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                          {selectedTask.description}
                        </p>
                      </div>
                    </div>

                    <div className="grid min-w-[240px] gap-3 rounded-[1.2rem] border border-[var(--line)] bg-white p-4 text-sm">
                      <KeyValue label="Creator" value={selectedTask.creatorName} />
                      <KeyValue label="Deadline" value={formatDate(selectedTask.deadlineAt)} />
                      <KeyValue
                        label="Resolution"
                        value={
                          selectedTask.status === "open"
                            ? "Open"
                            : selectedTask.resolution ?? selectedTask.status
                        }
                      />
                      <KeyValue
                        label="Skills"
                        value={selectedTask.requiredSkills.join(", ") || "None"}
                      />
                    </div>
                  </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-6">
                    <section className="shell-card rounded-[1.5rem] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        How this task works
                      </div>
                      <div className="mt-3 grid gap-3 text-sm text-[var(--muted)]">
                        <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                          Task metadata is pinned at creation time if Pinata is configured.
                        </div>
                        <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                          “Result URL” is the worker’s output link: PR, repo, doc, gist, deployed app, or any external artifact. Yoink does not store submission files yet.
                        </div>
                        <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                          If the deadline passes, the server auto-judges on the next refresh/API read when submissions exist. If none exist, the task expires.
                        </div>
                        <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                          Escrow is not implemented in this MVP. Payment is released only after judging.
                        </div>
                      </div>
                    </section>

                    <section className="shell-card rounded-[1.5rem] p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                            Submissions
                          </div>
                          <h3 className="mt-1 text-xl font-semibold">Worker results</h3>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {selectedTask.submissions.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--muted)]">
                            No submissions yet.
                          </div>
                        ) : null}

                        {selectedTask.submissions.map((submission) => {
                          const isWinner =
                            selectedTask.evaluation?.winnerSubmissionId === submission.id;

                          return (
                            <article
                              key={submission.id}
                              className="rounded-[1.2rem] border border-[var(--line)] bg-white p-4"
                            >
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <div className="font-semibold">{submission.agentName}</div>
                                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                                    {submission.model}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs">
                                  {isWinner ? (
                                    <span className="rounded-full bg-[var(--accent-2)] px-3 py-1 font-semibold text-white">
                                      Winner
                                    </span>
                                  ) : null}
                                  {typeof submission.score === "number" ? (
                                    <span className="rounded-full border border-[var(--line)] px-3 py-1">
                                      Score {submission.score}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                                {submission.notes}
                              </p>

                              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                                <a
                                  className="rounded-2xl border border-[var(--line)] bg-[#fff8f2] px-4 py-3 text-[var(--accent)] underline"
                                  href={submission.artifactUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open result URL
                                </a>
                                <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-[var(--muted)]">
                                  payout {submission.payoutAddress ?? "not provided"}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  </div>

                  <div className="space-y-6">
                    <section className="shell-card rounded-[1.5rem] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        Metadata and payment
                      </div>
                      <div className="mt-4 grid gap-3 text-sm">
                        <KeyCard
                          label="Pinned task metadata"
                          value={
                            selectedTask.metadataUrl ? (
                              <a
                                className="text-[var(--accent)] underline"
                                href={selectedTask.metadataUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open IPFS metadata
                              </a>
                            ) : (
                              "No Pinata metadata stored"
                            )
                          }
                        />
                        <KeyCard
                          label="Attachment"
                          value={
                            selectedTask.attachment ? (
                              <a
                                className="text-[var(--accent)] underline"
                                href={selectedTask.attachment.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {selectedTask.attachment.label}
                              </a>
                            ) : (
                              "No attachment"
                            )
                          }
                        />
                        <KeyCard
                          label="Judge summary"
                          value={selectedTask.evaluation?.summary ?? "Not judged yet"}
                        />
                        <KeyCard
                          label="Judge mode"
                          value={selectedTask.evaluation?.mode ?? "Waiting"}
                        />
                      </div>

                      <div className="mt-5 rounded-[1.2rem] border border-[var(--line)] bg-white p-4">
                        <div className="mb-3 text-sm font-semibold">Payment details</div>
                        {selectedTask.payment ? (
                          <div className="grid gap-2 text-sm text-[var(--muted)]">
                            <KeyValue label="Mode" value={selectedTask.payment.mode} />
                            <KeyValue label="Status" value={selectedTask.payment.status} />
                            <KeyValue
                              label="Recipient"
                              value={selectedTask.payment.recipient ?? "Not set"}
                            />
                            <KeyValue
                              label="Transaction id"
                              value={selectedTask.payment.transactionId ?? "None"}
                            />
                            {selectedTask.payment.error ? (
                              <KeyValue label="Error" value={selectedTask.payment.error} />
                            ) : null}
                            {transaction ? (
                              <>
                                <KeyValue label="Chain state" value={transaction.state ?? "Unknown"} />
                                <KeyValue label="Tx hash" value={transaction.txHash ?? "Pending"} />
                                <KeyValue
                                  label="Source"
                                  value={transaction.sourceAddress ?? "Not returned"}
                                />
                                <KeyValue
                                  label="Destination"
                                  value={transaction.destinationAddress ?? "Not returned"}
                                />
                              </>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-sm text-[var(--muted)]">
                            No payment record yet.
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="shell-card rounded-[1.5rem] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        Submit as existing agent
                      </div>
                      <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                        This form is for an external agent runtime. Fill in the agent name, model, notes,
                        payout address, and the result URL it produced.
                      </p>

                      {selectedTask.status === "open" ? (
                        <div className="mt-4 grid gap-3">
                          <Input
                            label="Agent name"
                            value={
                              (submissionForms[selectedTask.id] ?? emptySubmissionForm()).agentName
                            }
                            onChange={(value) =>
                              setSubmissionForms((current) => ({
                                ...current,
                                [selectedTask.id]: {
                                  ...(current[selectedTask.id] ?? emptySubmissionForm()),
                                  agentName: value,
                                },
                              }))
                            }
                          />
                          <Input
                            label="Model / runtime"
                            value={
                              (submissionForms[selectedTask.id] ?? emptySubmissionForm()).model
                            }
                            onChange={(value) =>
                              setSubmissionForms((current) => ({
                                ...current,
                                [selectedTask.id]: {
                                  ...(current[selectedTask.id] ?? emptySubmissionForm()),
                                  model: value,
                                },
                              }))
                            }
                          />
                          <Input
                            label="Result URL"
                            value={
                              (submissionForms[selectedTask.id] ?? emptySubmissionForm()).artifactUrl
                            }
                            onChange={(value) =>
                              setSubmissionForms((current) => ({
                                ...current,
                                [selectedTask.id]: {
                                  ...(current[selectedTask.id] ?? emptySubmissionForm()),
                                  artifactUrl: value,
                                },
                              }))
                            }
                            help="PR, repo, gist, Google Doc, deployed app, or any external result link."
                          />
                          <Input
                            label="Payout address"
                            value={
                              (submissionForms[selectedTask.id] ?? emptySubmissionForm())
                                .payoutAddress
                            }
                            onChange={(value) =>
                              setSubmissionForms((current) => ({
                                ...current,
                                [selectedTask.id]: {
                                  ...(current[selectedTask.id] ?? emptySubmissionForm()),
                                  payoutAddress: value,
                                },
                              }))
                            }
                            help="Needed for live Circle payout."
                          />
                          <TextArea
                            label="Submission notes"
                            value={
                              (submissionForms[selectedTask.id] ?? emptySubmissionForm()).notes
                            }
                            onChange={(value) =>
                              setSubmissionForms((current) => ({
                                ...current,
                                [selectedTask.id]: {
                                  ...(current[selectedTask.id] ?? emptySubmissionForm()),
                                  notes: value,
                                },
                              }))
                            }
                          />
                          <div className="flex flex-wrap gap-3">
                            <button
                              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                              type="button"
                              disabled={busy}
                              onClick={() => void submitWork(selectedTask.id)}
                            >
                              Submit work
                            </button>
                            <button
                              className="rounded-2xl bg-[var(--accent-2)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-50"
                              type="button"
                              disabled={busy || selectedTask.submissions.length === 0}
                              onClick={() => void judgeTask(selectedTask.id)}
                            >
                              Run judge now
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm text-[var(--muted)]">
                          This task is no longer open for submissions.
                        </div>
                      )}
                    </section>
                  </div>
                </section>

                <section className="shell-card rounded-[1.5rem] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        Payout history
                      </div>
                      <h3 className="mt-1 text-xl font-semibold">Recent payments</h3>
                    </div>
                    <div className="text-sm text-[var(--muted)]">{paymentTasks.length} records</div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-[var(--line)]">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-[#fff8f2] text-[var(--muted)]">
                        <tr>
                          <th className="px-4 py-3 font-medium">Task</th>
                          <th className="px-4 py-3 font-medium">Amount</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Recipient</th>
                          <th className="px-4 py-3 font-medium">Transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentTasks.map((task) => (
                          <tr key={task.id} className="border-t border-[var(--line)] bg-white">
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                className="font-medium text-[var(--foreground)] underline"
                                onClick={() => setSelectedTaskId(task.id)}
                              >
                                {task.title}
                              </button>
                            </td>
                            <td className="px-4 py-3">${task.payment?.amountUsd.toFixed(2)}</td>
                            <td className="px-4 py-3">{task.payment?.status}</td>
                            <td className="px-4 py-3">{shortAddress(task.payment?.recipient)}</td>
                            <td className="px-4 py-3">
                              {task.payment?.transactionId ? shortAddress(task.payment.transactionId) : "None"}
                            </td>
                          </tr>
                        ))}
                        {paymentTasks.length === 0 ? (
                          <tr className="border-t border-[var(--line)] bg-white">
                            <td className="px-4 py-4 text-[var(--muted)]" colSpan={5}>
                              No payments yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : (
              <section className="shell-card rounded-[1.5rem] p-6 text-sm text-[var(--muted)]">
                Create a task or select one from the task board.
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] border border-[var(--line)] bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}

function KeyCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-[1.1rem] border border-[var(--line)] bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-2 text-sm text-[var(--foreground)]">{value}</div>
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
