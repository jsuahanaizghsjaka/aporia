import { z } from "zod";
export const goalDraftSchema = z
  .object({
    summary: z.string().trim().min(8).max(500),
    success_criteria: z
      .array(z.string().trim().min(5).max(300))
      .min(1)
      .max(5)
      .refine((v) => new Set(v.map((x) => x.toLowerCase())).size === v.length),
    target_date: z.iso.date().nullable(),
  })
  .strict();
export const goalRecordSchema = goalDraftSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
  updated_at: z.string(),
});
export const saveGoalSchema = goalDraftSchema
  .extend({ version: z.number().int().nonnegative(), requestId: z.uuid() })
  .strict();
export type GoalDraft = z.infer<typeof goalDraftSchema>;
export type GoalRecord = z.infer<typeof goalRecordSchema>;
