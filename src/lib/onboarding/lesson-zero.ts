import { profileSchema, type ProfileView } from "../profile/schema.ts";

export const profileTextFields = [
  { key: "displayName", label: "Как тебя называть", limit: 60 },
  { key: "goal", label: "Направление и цель обучения", limit: 500 },
  { key: "context", label: "Твоя текущая ситуация", limit: 1000 },
  { key: "experience", label: "Что уже умеешь", limit: 1000 },
  { key: "workStudy", label: "Работа и учёба", limit: 1000 },
  { key: "weeklyAvailability", label: "Время по неделе", limit: 1000 },
  { key: "interests", label: "Интересы", limit: 500 },
  { key: "hobbies", label: "Хобби и спорт", limit: 500 },
  { key: "preferences", label: "Как удобнее учиться", limit: 500 },
  { key: "currentProjects", label: "Текущие проекты", limit: 1000 },
] as const;
export type ProfileTextKey = (typeof profileTextFields)[number]["key"];
export type LessonField = ProfileTextKey | "dailyMinutes";
type Question = {
  key: LessonField;
  prompt: string;
  placeholder: string;
  reply: string;
  optional: boolean;
  limit: number;
};
export const questions: readonly Question[] = [
  {
    key: "displayName",
    prompt:
      "Привет, я Aporia. Начнём с того, что важно тебе, и выберем подходящий темп. Как тебя называть?",
    placeholder: "Имя или удобное обращение…",
    reply: "Приятно познакомиться.",
    optional: false,
    limit: 60,
  },
  {
    key: "context",
    prompt: "Что сейчас подтолкнуло тебя начать учиться?",
    placeholder: "Можно начать с пары слов…",
    reply: "Спасибо, это наша отправная точка.",
    optional: true,
    limit: 1000,
  },
  {
    key: "goal",
    prompt:
      "Какое направление или стек тебе интересны и к какому результату хочешь прийти?",
    placeholder: "Напиши направление и желаемый результат своими словами…",
    reply: "Будем держать эту цель в фокусе.",
    optional: false,
    limit: 500,
  },
  {
    key: "experience",
    prompt: "Что в этом направлении ты уже пробовал?",
    placeholder: "Даже небольшой опыт считается; можно начать с нуля…",
    reply:
      "Это поможет выбрать, с чего начать. Уровень позже проверим на практике.",
    optional: true,
    limit: 1000,
  },
  {
    key: "workStudy",
    prompt:
      "Чем сейчас занят твой обычный день — работой, учёбой или чем-то ещё?",
    placeholder: "Только то, что поможет подобрать нагрузку…",
    reply: "Понятно. Учебный ритм должен вписываться в твою жизнь.",
    optional: true,
    limit: 1000,
  },
  {
    key: "weeklyAvailability",
    prompt: "В какие дни и часы недели тебе обычно удобно учиться?",
    placeholder: "Например, вт и чт вечером, сб утром; или график меняется…",
    reply: "Зафиксируем этот график. Его можно будет изменить.",
    optional: true,
    limit: 1000,
  },
  {
    key: "interests",
    prompt: "Какие темы тебе интересны вне программирования?",
    placeholder: "Например, музыка, история, игры, предпринимательство…",
    reply: "Такие темы пригодятся для примеров и идей проекта.",
    optional: true,
    limit: 500,
  },
  {
    key: "hobbies",
    prompt: "Есть ли хобби или спорт, которые ты хотел бы учесть в обучении?",
    placeholder: "Можно рассказать об увлечении или пропустить…",
    reply: "Оставим место и для того, что тебе нравится.",
    optional: true,
    limit: 500,
  },
  {
    key: "preferences",
    prompt: "Как тебе легче разбираться в новой теме?",
    placeholder: "Через примеры, небольшие задачи, объяснения, свой проект…",
    reply: "Возьмём это как предпочтение, а не жёсткое правило.",
    optional: true,
    limit: 500,
  },
  {
    key: "dailyMinutes",
    prompt: "Сколько минут удобно выделять на одно занятие в учебный день?",
    placeholder: "От 10 до 120 минут…",
    reply: "Начнём с такого размера занятия.",
    optional: true,
    limit: 30,
  },
  {
    key: "currentProjects",
    prompt: "Есть ли сейчас свой проект, с которым хочется связать обучение?",
    placeholder: "Опиши идею или напиши, что проекта пока нет…",
    reply:
      "Теперь посмотрим на всё вместе. Ничего не сохраняется без твоего подтверждения.",
    optional: true,
    limit: 1000,
  },
];
export type LessonMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};
export type LessonDraft = {
  index: number;
  profile: ProfileView;
  messages: LessonMessage[];
};
export function beginLesson(profile: ProfileView): LessonDraft {
  return {
    index: 0,
    profile: { ...profile },
    messages: [
      { id: "question-0", role: "assistant", content: questions[0].prompt },
    ],
  };
}
export function answerLesson(
  draft: LessonDraft,
  answer: string,
  skip = false,
): LessonDraft {
  const question = questions[draft.index];
  if (!question)
    throw new Error("Все темы уже пройдены. Проверь итоговый профиль.");
  if (skip && !question.optional)
    throw new Error("Имя и цель нужны, чтобы начать. Можно ответить коротко.");
  const value = answer.trim();
  if (!skip && (!value || value.length > question.limit))
    throw new Error(
      `Ответ должен содержать от 1 до ${question.limit} символов.`,
    );
  const profile = { ...draft.profile };
  if (!skip) {
    if (question.key === "dailyMinutes") {
      const minutes =
        /^(\d{1,3})(?:\s*(?:мин(?:ут(?:а|ы)?)?\.?|minutes?))?$/i.exec(value);
      const count = minutes ? Number(minutes[1]) : NaN;
      if (!Number.isInteger(count) || count < 10 || count > 120)
        throw new Error(
          "Укажи продолжительность от 10 до 120 минут, например: 25 минут.",
        );
      profile.dailyMinutes = count;
    } else profile[question.key] = value;
  }
  const index = draft.index + 1;
  const next = questions[index];
  return {
    index,
    profile,
    messages: [
      ...draft.messages,
      {
        id: `answer-${draft.index}`,
        role: "user",
        content: skip ? "Пока пропущу." : value,
      },
      {
        id: `question-${index}`,
        role: "assistant",
        content: `${skip ? "Хорошо, можно вернуться к этому позже." : question.reply}${next ? `\n\n${next.prompt}` : "\n\nПроверь итоговый профиль и поправь то, что нужно."}`,
      },
    ],
  };
}
export function confirmedLessonProfile(profile: ProfileView): ProfileView {
  return {
    ...profile,
    ...profileSchema.parse({ ...profile, onboardingComplete: true }),
  };
}
