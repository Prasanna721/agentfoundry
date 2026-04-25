/**
 * Gemini-backed judge.
 *
 * Given a forge brief and N submissions (each with role + deliverable text),
 * we ask Gemini to:
 *   1. Score each submission against the brief on a 0–100 scale.
 *   2. Pick the best one.
 *   3. Explain why in <60 words.
 *
 * Returns a parsed verdict; the caller is responsible for translating
 * winner role → wallet address and submitting pickWinner on chain.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const model  = process.env.GEMINI_MODEL || "gemini-2.0-flash";

if (!apiKey) {
  throw new Error("GEMINI_API_KEY missing — set it in .env");
}

const ai = new GoogleGenerativeAI(apiKey);
const llm = ai.getGenerativeModel({
  model,
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role:  { type: "string" },
              score: { type: "number" },
              note:  { type: "string" },
            },
            required: ["role", "score", "note"],
          },
        },
        winner: { type: "string" },
        reason: { type: "string" },
      },
      required: ["scores", "winner", "reason"],
    },
  },
});

export interface JudgeInput {
  brief: { title: string; description: string; category?: string };
  submissions: { role: string; deliverable: string }[];
}

export interface Verdict {
  winner: string;
  reason: string;
  scores: { role: string; score: number; note: string }[];
}

export async function judge(input: JudgeInput): Promise<Verdict> {
  if (input.submissions.length < 1) throw new Error("no submissions to judge");

  const prompt = [
    `You are an impartial judge for a task marketplace. A creator posted the following brief; smith agents submitted answers.`,
    ``,
    `BRIEF:`,
    `  Title:       ${input.brief.title}`,
    `  Category:    ${input.brief.category ?? "general"}`,
    `  Description: ${input.brief.description}`,
    ``,
    `SUBMISSIONS (each from one agent):`,
    ...input.submissions.map((s, i) => [
      `  --- submission ${i + 1} (role=${s.role}) ---`,
      s.deliverable.slice(0, 4000),  // protect token budget
      ``,
    ].join("\n")),
    ``,
    `INSTRUCTIONS:`,
    `  1. Score each submission 0–100 against the brief — correctness, conciseness, fitness for purpose.`,
    `  2. Pick exactly one winner (the role string of the best submission).`,
    `  3. Reply with valid JSON matching the schema. The "winner" field MUST be one of the roles listed above.`,
  ].join("\n");

  const r = await llm.generateContent(prompt);
  const text = r.response.text();
  const v = JSON.parse(text) as Verdict;

  // sanity check: winner must be one of the submitted roles
  const validRoles = new Set(input.submissions.map((s) => s.role));
  if (!validRoles.has(v.winner)) {
    // fall back to highest-scored role
    const best = [...v.scores].sort((a, b) => b.score - a.score)[0];
    v.winner = best?.role ?? input.submissions[0].role;
  }

  return v;
}
