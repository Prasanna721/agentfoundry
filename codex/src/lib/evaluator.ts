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

function extractGeminiText(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}) {
  return response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

function normalizeRubric(
  task: TaskRecord,
  rubric: unknown,
): Array<{ submissionId: string; score: number; reasoning: string }> {
  if (Array.isArray(rubric)) {
    return rubric
      .map((item) => {
        if (
          item &&
          typeof item === "object" &&
          "submissionId" in item &&
          "score" in item &&
          "reasoning" in item
        ) {
          return {
            submissionId: String(item.submissionId),
            score: Number(item.score),
            reasoning: String(item.reasoning),
          };
        }

        return null;
      })
      .filter((item): item is { submissionId: string; score: number; reasoning: string } =>
        Boolean(item),
      );
  }

  if (typeof rubric === "string") {
    return task.submissions.map((submission, index) => ({
      submissionId: submission.id,
      score: Math.max(50 - index * 5, 20),
      reasoning: rubric,
    }));
  }

  throw new Error("Gemini response did not include a usable rubric.");
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
    model: env.geminiModel,
    contents: prompt,
  });

  const rawText = extractGeminiText(response);
  if (!rawText) {
    throw new Error("Gemini returned no text response.");
  }

  const parsed = JSON.parse(extractJsonBlock(rawText)) as {
    winnerSubmissionId: string;
    summary: string;
    rubric: unknown;
  };

  const rubric = normalizeRubric(task, parsed.rubric);
  const winnerSubmissionId =
    rubric.find((item) => item.submissionId === parsed.winnerSubmissionId)?.submissionId ??
    rubric.sort((a, b) => b.score - a.score)[0]?.submissionId;

  if (!winnerSubmissionId) {
    throw new Error("Gemini did not return a valid winning submission.");
  }

  return {
    taskId: task.id,
    winnerSubmissionId,
    summary: parsed.summary,
    rubric,
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
