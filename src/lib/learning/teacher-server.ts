import "server-only";
import { structuredResponse } from "../ai/structured";
import { buildMemory } from "../ai/memory";
import { lessonActionSchema } from "../ai/contracts";
import { taskPrompt } from "../../prompts/tasks";
import { type LearningState } from "./types";
import { resolveTeacher } from "./teacher";
import { skillProgress } from "./selectors";
import type { selectMission } from "./mission";
export async function prepareTeacher(
  profile: unknown,
  mission: ReturnType<typeof selectMission>,
  state: LearningState,
  signal: AbortSignal,
) {
  const memory = buildMemory(profile, state, { summary: mission.goal });
  const choice = await structuredResponse(
    lessonActionSchema,
    "lesson_teacher",
    taskPrompt("teacher"),
    {
      memory,
      goal: mission.goal,
      skill: mission.today_skill,
      mastery: skillProgress(state, mission.today_skill),
      available_time: mission.estimated_time,
      session_plan: {
        theory: mission.theory,
        exercise: mission.exercise,
        project: mission.project,
      },
      past_errors: memory.learning.recent_errors.filter((r) =>
        r.question.startsWith(mission.today_skill + "."),
      ),
      project: state.project
        ? {
            id: state.project.id,
            checkpoints: state.project.checkpoints,
            saved_skills: Object.keys(state.project.artifacts),
          }
        : null,
    },
    signal,
  );
  return resolveTeacher(mission.today_skill, choice, "ai");
}
