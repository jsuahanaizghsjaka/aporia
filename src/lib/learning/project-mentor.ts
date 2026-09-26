import { z } from "zod";
import { projectTasks } from "./projects.ts";
import type { LearningState, SkillId } from "./types.ts";

export const projectLearnReplySchema = z.strictObject({
  focus: z.enum(["inputs", "boundary", "test", "ownership", "simplify"]),
  criterion: z.number().int().min(0).max(2),
});
export const projectHelpReplySchema = z.strictObject({
  reply: z.string().trim().min(10).max(6000),
  decision: z.string().trim().min(5).max(1000).nullable(),
});
export function learnProjectReply(
  skill: SkillId,
  choice: z.infer<typeof projectLearnReplySchema>,
) {
  const task = projectTasks[skill];
  const tips = {
    inputs:
      "Назови входные данные и ожидаемый результат одного вызова. Как ты проверишь их на маленьком примере?",
    boundary:
      "Возьми пустой ввод или отсутствующую запись. Что должно произойти и где это обрабатывается в твоём решении?",
    test: "Начни с одного теста: подготовка данных → действие → проверка результата. Какой assert подтвердит нужное поведение?",
    ownership:
      "Если есть пользовательские данные, проверь, откуда взят владелец и где ограничивается доступ. Какие данные нельзя брать на веру?",
    simplify:
      "Выдели самый маленький работающий шаг. Пока не добавляй остальные возможности: покажи один вход, код и полученный результат.",
  };
  return `Сейчас работаем над «${task.title}».\n\n${tips[choice.focus]}\n\nОриентир: ${task.criteria[choice.criterion]}. Пришли свой фрагмент или результат запуска.\n\nLearn: ментор выбирает проверенный вопрос, а не пишет проект за тебя. Для прямого разбора можно переключиться в Help. Код здесь не запускался.`;
}
export function appendProjectMessage(
  state: LearningState,
  input: {
    id: string;
    skill: SkillId;
    question: string;
    reply: string;
    decision: string | null;
  },
  at = new Date().toISOString(),
): LearningState {
  if (
    state.requestIds.includes(input.id) ||
    state.project?.messages?.some((m) => m.id === input.id)
  )
    return state;
  if (!state.project) throw new Error("Сначала выбери проект.");
  if ((state.project.messages?.length ?? 0) >= 100)
    throw new Error("История проекта заполнена (100 сообщений).");
  const next = structuredClone(state),
    p = next.project!;
  (p.messages ??= []).push({ ...input, mode: p.mode ?? "learn", at });
  // Conservative evidence: mentor-assisted project answers never count as independent.
  (p.assistance ??= {})[input.skill] = 5;
  next.requestIds = [...next.requestIds, input.id].slice(-200);
  return next;
}
