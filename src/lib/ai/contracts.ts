import { z } from "zod";
import { memoryCandidateSchema } from "../profile/memory.ts";
import { roadmapDraftSchema, validRoadmapOrder } from "../roadmaps/schema.ts";
import {
  stateSchema,
  teacherChoiceSchema,
  skillSchema,
  skillIds,
  type LearningState,
} from "../learning/types.ts";
import { skillProgress } from "../learning/selectors.ts";

export const userProfileSchema = memoryCandidateSchema;
export const roadmapSchema = roadmapDraftSchema.refine(
  validRoadmapOrder,
  "Нарушен порядок базовых навыков.",
);
// An AI lesson action selects the explanation/application, never an answer,
// score or unrestricted state mutation. The teaching ladder is server-owned.
export const lessonActionSchema = teacherChoiceSchema;
export const weeklyReviewSchema = stateSchema.shape.weeklyReviews
  .unwrap()
  .element.strict();
export const diagnosticResultSchema = z
  .strictObject({
    session_id: z.uuid(),
    answered: z.number().int().min(0).max(9),
    correct: z.number().int().min(0).max(9),
    completed: z.boolean(),
  })
  .refine((v) => v.correct <= v.answered && (!v.completed || v.answered === 9));
export const masteryUpdateSchema = z
  .strictObject({
    skills: z
      .array(
        z.strictObject({
          skill: skillSchema,
          mastery: z.number().int().min(0).max(95),
          confidence: z.number().int().min(0).max(100),
          evidence_count: z.number().int().nonnegative(),
          last_practiced: z.iso.datetime().nullable(),
        }),
      )
      .length(8),
  })
  .refine((v) => new Set(v.skills.map((s) => s.skill)).size === 8);

export function diagnosticResult(state: LearningState) {
  const session = state.sessions.findLast((s) => s.kind === "diagnostic");
  return session
    ? diagnosticResultSchema.parse({
        session_id: session.id,
        answered: session.results.length,
        correct: session.results.filter((r) => r.correct).length,
        completed: !!session.completedAt,
      })
    : null;
}
export function masteryUpdate(state: LearningState) {
  return masteryUpdateSchema.parse({
    skills: skillIds.map((skill) => {
      const p = skillProgress(state, skill);
      return {
        skill,
        mastery: p.mastery,
        confidence: p.confidence,
        evidence_count: p.count,
        last_practiced: p.last?.at ?? null,
      };
    }),
  });
}
export function validateLearningWrite(raw: LearningState) {
  const state = stateSchema.strict().parse(raw);
  diagnosticResult(state);
  masteryUpdate(state);
  for (const review of state.weeklyReviews) weeklyReviewSchema.parse(review);
  for (const session of state.sessions)
    if (session.lesson) lessonActionSchema.parse(session.lesson.teacher.choice);
  return state;
}
