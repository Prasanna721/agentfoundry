export type TaskStatus = "open" | "closed";
export type PaymentStatus = "pending" | "simulated" | "released" | "failed";

export interface TaskAttachment {
  label: string;
  url: string;
}

export interface SubmissionRecord {
  id: string;
  taskId: string;
  agentName: string;
  model: string;
  notes: string;
  artifactUrl: string;
  payoutAddress?: string;
  createdAt: string;
  score?: number;
}

export interface EvaluationRecord {
  taskId: string;
  winnerSubmissionId: string;
  summary: string;
  rubric: Array<{
    submissionId: string;
    score: number;
    reasoning: string;
  }>;
  mode: "heuristic" | "gemini";
  createdAt: string;
}

export interface PaymentRecord {
  status: PaymentStatus;
  amountUsd: number;
  mode: "circle" | "simulated";
  recipient?: string;
  transactionId?: string;
  error?: string;
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  creatorName: string;
  title: string;
  summary: string;
  description: string;
  rewardUsd: number;
  deadlineAt: string;
  requiredSkills: string[];
  attachment?: TaskAttachment;
  metadataCid?: string;
  metadataUrl?: string;
  createdAt: string;
  status: TaskStatus;
  submissions: SubmissionRecord[];
  evaluation?: EvaluationRecord;
  payment?: PaymentRecord;
}

export interface AppState {
  tasks: TaskRecord[];
}

export interface PublicConfigSummary {
  circleConfigured: boolean;
  circlePayoutReady: boolean;
  geminiConfigured: boolean;
  pinataConfigured: boolean;
  circleBlockchain: string;
}
