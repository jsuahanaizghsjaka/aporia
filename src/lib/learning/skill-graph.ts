import { z } from "zod";
import { skillSchema, type LearningState } from "./types.ts";
import { curriculum } from "./curriculum.ts";
import { skillProgress } from "./selectors.ts";
export const graphSchema = z
  .object({
    skills: z
      .array(
        z.object({
          id: z.enum(["backend", ...skillSchema.options]),
          title: z.string(),
          parent_skill_id: z
            .enum(["backend", ...skillSchema.options])
            .nullable(),
          prerequisite_skill_id: skillSchema.nullable(),
          position: z.number().int(),
        }),
      )
      .length(9),
    user_skills: z
      .array(
        z.object({
          skill_id: skillSchema,
          mastery_score: z.number().int().min(0).max(100),
          confidence: z.number().int().min(0).max(100),
          evidence_count: z.number().int().nonnegative(),
          last_practiced: z.string().nullable(),
        }),
      )
      .length(8),
  })
  .refine(
    (g) =>
      new Set(g.skills.map((s) => s.id)).size === 9 &&
      new Set(g.user_skills.map((s) => s.skill_id)).size === 8 &&
      g.skills.every(
        (s) => s.parent_skill_id === (s.id === "backend" ? null : "backend"),
      ),
  );
export type SkillGraph = z.infer<typeof graphSchema>;
export function previewGraph(state: LearningState): SkillGraph {
  return {
    skills: [
      {
        id: "backend",
        title: "Python backend",
        parent_skill_id: null,
        prerequisite_skill_id: null,
        position: 0,
      },
      ...curriculum.map((s, i) => ({
        id: s.id,
        title: s.short,
        parent_skill_id: "backend" as const,
        prerequisite_skill_id: s.prerequisite,
        position: i + 1,
      })),
    ],
    user_skills: curriculum.map((s) => {
      const p = skillProgress(state, s.id);
      return {
        skill_id: s.id,
        mastery_score: p.mastery,
        confidence: p.confidence,
        evidence_count: p.count,
        last_practiced: p.last?.at ?? null,
      };
    }),
  };
}
