import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/request";
import { actionSchema, stateSchema } from "@/lib/learning/types";
import { applyAction, learningView } from "@/lib/learning/engine";
import { initialLearningState } from "@/lib/learning/selectors";
import { roadmapRecordSchema } from "@/lib/roadmaps/schema";
const inputSchema = z.object({
  state: stateSchema.optional(),
  action: actionSchema.optional(),
  roadmap: roadmapRecordSchema.nullable().optional(),
  requestId: z.uuid(),
  profile: z.object({
    onboardingComplete: z.boolean(),
    dailyMinutes: z.number().int().min(10).max(120),
    interests: z.string().max(500),
    goal: z.string().max(500),
  }),
});
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  try {
    const body = await request.text();
    if (body.length > 600000)
      return Response.json(
        { error: "История предпросмотра слишком велика." },
        { status: 413 },
      );
    const input = inputSchema.parse(JSON.parse(body));
    const state = input.state ?? initialLearningState();
    const next = input.action
      ? applyAction(
          state,
          input.action,
          input.profile,
          input.requestId,
          new Date(),
          {
            goal: { summary: input.profile.goal },
            roadmap: input.roadmap ?? null,
          },
        )
      : state;
    return Response.json(
      { ...learningView(next), version: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? "Не удалось прочитать локальное занятие."
            : error instanceof Error
              ? error.message
              : "Не удалось проверить ответ.",
      },
      { status: 422 },
    );
  }
}
