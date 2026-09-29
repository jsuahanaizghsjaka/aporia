import "server-only";
import { z } from "zod";
import { structuredResponse } from "../ai/structured";
import { AIError } from "../ai/errors";
import { buildMemory } from "../ai/memory";
import { taskPrompt } from "../../prompts/tasks";
import { resourceCandidates, resourceSelection } from "./resources";
import { availableFocus, createWeeklyReview } from "./weekly";
import { skillProgress } from "./selectors";
import { availableToday } from "../profile/schedule";
import type { LearningProfile, LearningState, SkillId } from "./types";

export async function personalizeResources(
  state: LearningState,
  profile: LearningProfile,
  skill: SkillId,
  id: string,
  now: Date,
  signal: AbortSignal,
) {
  const candidates = resourceCandidates(state, skill);
  const schema = z.strictObject({
    ids: z
      .array(z.enum(candidates.map((r) => r.id) as [string, ...string[]]))
      .min(1)
      .max(3),
  });
  const choice = await structuredResponse(
    schema,
    "learning_resources",
    taskPrompt("resources"),
    {
      memory: buildMemory(profile, state, null, now),
      skill,
      level: skillProgress(state, skill),
      minutes: availableToday(profile, now),
      candidates,
      feedback: state.resourceSelections
        .filter((s) => s.skill === skill)
        .slice(-5),
    },
    signal,
  );
  try {
    resourceSelection(state, profile, skill, id, now, choice.ids);
  } catch {
    throw new AIError("AI_INVALID_RESPONSE");
  }
  return choice.ids;
}
export async function personalizeWeek(
  state: LearningState,
  profile: LearningProfile,
  id: string,
  now: Date,
  signal: AbortSignal,
) {
  const allowed = availableFocus(state);
  const schema = z.strictObject({
    focus: z.enum(allowed as [SkillId, ...SkillId[]]),
  });
  const choice = await structuredResponse(
    schema,
    "weekly_review",
    taskPrompt("weeklyReview"),
    {
      memory: buildMemory(profile, state, null, now),
      summary: createWeeklyReview(state, profile, id, now),
      allowed,
      feedback: state.feedback.slice(-10),
    },
    signal,
  );
  return choice.focus;
}
