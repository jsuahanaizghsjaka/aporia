import { z } from "zod";
import { profileSchema, type ProfileView } from "./schema.ts";
const list = z
  .array(z.string().trim().min(1).max(100))
  .max(12)
  .refine(
    (v) => new Set(v.map((x) => x.toLowerCase())).size === v.length,
    "Убери повторяющиеся значения.",
  )
  .refine((v) => v.join(", ").length <= 500);
export const memoryCandidateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    occupation: z.string().trim().max(500),
    education: z.string().trim().max(500),
    goal_summary: z.string().trim().min(1).max(500),
    weekly_available_hours: z.number().min(0.5).max(80).nullable(),
    interests: list,
    hobbies: list,
    learning_preferences: list,
    preferred_session_length: z.number().int().min(10).max(120),
    notes: z.string().trim().max(2000),
  })
  .strict();
export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;
export const profileMemorySchema = memoryCandidateSchema.extend({
  onboarding_completed: z.boolean(),
  personal_schedule: profileSchema.shape.schedule.optional(),
});
const split = (value: string) => [
  ...new Set(
    value
      .split(/[,;\n]/)
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export function memoryFromProfile(raw: unknown) {
  const p = profileSchema.parse(raw);
  return {
    name: p.displayName,
    occupation: p.occupation,
    education: p.education,
    goal_summary: p.goal,
    weekly_available_hours: p.weeklyAvailableHours,
    interests: split(p.interests),
    hobbies: split(p.hobbies),
    learning_preferences: split(p.preferences),
    preferred_session_length: p.dailyMinutes,
    notes: p.notes,
    onboarding_completed: p.onboardingComplete,
    personal_schedule: p.schedule,
  };
}
export function profileFromMemory(
  profile: ProfileView,
  raw: unknown,
): ProfileView {
  const m = memoryCandidateSchema.parse(raw);
  return {
    ...profile,
    ...profileSchema.parse({
      ...profile,
      displayName: m.name,
      occupation: m.occupation,
      education: m.education,
      goal: m.goal_summary,
      weeklyAvailableHours: m.weekly_available_hours,
      interests: m.interests.join(", "),
      hobbies: m.hobbies.join(", "),
      preferences: m.learning_preferences.join(", "),
      dailyMinutes: m.preferred_session_length,
      notes: m.notes,
    }),
  };
}
