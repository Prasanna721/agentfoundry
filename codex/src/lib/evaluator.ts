import { GoogleGenAI } from "@google/genai";

import { env } from "@/lib/env";
import type { EvaluationRecord, TaskRecord } from "@/lib/types";

function heuristicScore(notes: string, artifactUrl: string, skillMatches: number) {
  const noteLengthScore = Math.min(notes.length / 40, 40);
  const artifactScore = artifactUrl.startsWith("http") ? 25 : 0;
  const specificityScore = Math.min(skillMatches * 8, 35);
  return Math.round(noteLengthScore + artifactScore + specificityScore);
}

function extractJsonBlock(raw: string) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1];
  }

  const inline = raw.match(/\{[\s\S]*\}/);
  return inline?.[0] ?? raw;
}

async function evaluateWithGemini(task: TaskRecord): Promise<EvaluationRecord> {
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const prompt = `
You are judging agent submissions for a paid task marketplace.
Return strict JSON with this shape:
{
  "winnerSubmissionId": "string",
  "summary": "string",
  "rubric": [
    { "submissionId": "string", "score": 0, "reasoning": "string" }
  ]
}

Task:
- Title: ${task.title}
- Summary: ${task.summary}
- Description: ${task.description}
- Required skills: ${task.requiredSkills.join(", ") || "none"}

Submissions:
${task.submissions
  .map(
    (submission) => `- id=${submission.id}
  agent=${submission.agentName}
  model=${submission.model}
  artifact=${submission.artifactUrl}
  notes=${submission.notes}`,
  )
  .join("\n")}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const parsed = JSON.parse(extractJsonBlock(response.text ?? "{}")) as {
    winnerSubmissionId: string;
    summary: string;
    rubric: Array<{ submissionId: string; score: number; reasoning: string }>;
  };

  return {
    taskId: task.id,
    winnerSubmissionId: parsed.winnerSubmissionId,
    summary: parsed.summary,
    rubric: parsed.rubric,
    mode: "gemini",
    createdAt: new Date().toISOString(),
  };
}

function evaluateHeuristically(task: TaskRecord): EvaluationRecord {
  const rubric = task.submissions.map((submission) => {
    const skillMatches = task.requiredSkills.filter((skill) =>
      `${submission.notes} ${submission.model}`.toLowerCase().includes(skill.toLowerCase()),
    ).length;

    return {
      submissionId: submission.id,
      score: heuristicScore(submission.notes, submission.artifactUrl, skillMatches),
      reasoning:
        skillMatches > 0
          ? `Matched ${skillMatches} requested skill keywords and provided a valid artifact URL.`
          : "Scored on completeness of notes, artifact URL presence, and overall specificity.",
    };
  });

  const winner = [...rubric].sort((a, b) => b.score - a.score)[0];

  return {
    taskId: task.id,
    winnerSubmissionId: winner.submissionId,
    summary:
      "Heuristic evaluation selected the most specific submission with the strongest artifact and requested skill overlap.",
    rubric,
    mode: "heuristic",
    createdAt: new Date().toISOString(),
  };
}

export async function evaluateTask(task: TaskRecord): Promise<EvaluationRecord> {
  if (!task.submissions.length) {
    throw new Error("Cannot judge a task with no submissions.");
  }

  if (env.geminiApiKey) {
    try {
      return await evaluateWithGemini(task);
    } catch {
      return evaluateHeuristically(task);
    }
  }

  return evaluateHeuristically(task);
}
