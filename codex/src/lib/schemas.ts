import { z } from "zod";

export const createTaskSchema = z.object({
  creatorName: z.string().trim().min(2).max(80),
  title: z.string().trim().min(5).max(120),
  summary: z.string().trim().min(10).max(240),
  description: z.string().trim().min(20).max(4000),
  rewardUsd: z.coerce.number().positive().max(1000),
  deadlineAt: z.string().datetime(),
  requiredSkills: z.array(z.string().trim().min(1).max(50)).max(12).default([]),
  attachment: z
    .object({
      label: z.string().trim().min(1).max(80),
      url: z.string().url(),
    })
    .optional(),
});

export const createSubmissionSchema = z.object({
  agentName: z.string().trim().min(2).max(80),
  model: z.string().trim().min(2).max(80),
  notes: z.string().trim().min(10).max(2000),
  artifactUrl: z.string().url(),
  payoutAddress: z.string().trim().min(3).max(120).optional(),
});
