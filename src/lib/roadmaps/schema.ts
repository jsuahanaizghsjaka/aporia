import { z } from "zod";
import { skillSchema, type SkillId } from "../learning/types.ts";

const roadmapItemSchema = z
  .object({
    skill_id: skillSchema,
    reason: z.string().trim().min(8).max(320),
  })
  .strict();

export const roadmapDraftSchema = z
  .object({ items: z.array(roadmapItemSchema).length(8) })
  .strict()
  .refine(
    (value) => new Set(value.items.map((item) => item.skill_id)).size === 8,
    "В маршруте должен быть каждый навык только один раз.",
  );

export const roadmapRecordSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  updated_at: z.iso.datetime(),
  goal_id: z.uuid(),
  items: z.array(roadmapItemSchema.extend({ position: z.number().int().min(1).max(8) })).length(8),
});

export const roadmapSaveSchema = roadmapDraftSchema.extend({
  version: z.number().int().nonnegative(),
  requestId: z.uuid(),
});

export type RoadmapDraft = z.infer<typeof roadmapDraftSchema>;
export type RoadmapRecord = z.infer<typeof roadmapRecordSchema>;

export function validRoadmapOrder(value: RoadmapDraft) {
  const positions = new Map(value.items.map((item, index) => [item.skill_id, index]));
  const dependencies: [SkillId, SkillId][] = [
    ["python", "git"], ["python", "sql"], ["python", "http"],
    ["http", "fastapi"], ["fastapi", "auth"], ["fastapi", "testing"],
    ["testing", "docker"],
  ];
  return dependencies.every(([before, after]) => positions.get(before)! < positions.get(after)!);
}
