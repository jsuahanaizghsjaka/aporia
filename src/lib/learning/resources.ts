import { curriculum } from "./curriculum.ts";
import { skillProgress } from "./selectors.ts";
import { availableToday } from "../profile/schedule.ts";
import type { LearningProfile, LearningState, SkillId } from "./types.ts";

export type Resource = {
  id: string;
  skills: readonly SkillId[];
  kind: "docs" | "video" | "book" | "podcast";
  title: string;
  url: string;
  note: string;
  minutes: number;
  minimum: number;
};
// Only publisher/author/official URLs. Neither model nor browser can supply a URL.
export const resourceCatalog: Resource[] = [
  ...curriculum.map((s) => ({
    id: `${s.id}-docs`,
    skills: [s.id],
    kind: "docs" as const,
    title: `${s.short}: официальный справочник`,
    url: s.resource,
    note: "Выбери раздел по текущему заданию. Время — ориентир для одного фрагмента, не всего справочника.",
    minutes: 10,
    minimum: 0,
  })),
  {
    id: "python-video",
    skills: ["python"],
    kind: "video",
    title: "CS50 Python: Functions, Variables",
    url: "https://cs50.harvard.edu/python/weeks/0/",
    note: "Английский. Видео и конспект Harvard; начни с небольшого фрагмента о функциях.",
    minutes: 15,
    minimum: 0,
  },
  {
    id: "think-python",
    skills: ["python"],
    kind: "book",
    title: "Think Python · глава 3: функции",
    url: "https://allendowney.github.io/ThinkPython/chap03.html",
    note: "Английский. Бесплатная глава, опубликованная автором. Попробуй один пример самостоятельно.",
    minutes: 15,
    minimum: 0,
  },
  {
    id: "pro-git",
    skills: ["git"],
    kind: "book",
    title: "Pro Git · основы Git",
    url: "https://git-scm.com/book/ru/v2",
    note: "Русский. Легальная онлайн-книга; выбери главу «Основы Git».",
    minutes: 15,
    minimum: 0,
  },
  {
    id: "cosmic-repository",
    skills: ["sql", "testing"],
    kind: "book",
    title: "Architecture Patterns with Python · Repository",
    url: "https://www.cosmicpython.com/book/chapter_02_repository.html",
    note: "Английский, углубление. Глава авторской онлайн-версии про хранение данных и тестируемые границы.",
    minutes: 25,
    minimum: 35,
  },
  {
    id: "fastapi-podcast",
    skills: ["http", "fastapi", "auth"],
    kind: "podcast",
    title: "Talk Python #284 · Modern and fast APIs with FastAPI",
    url: "https://talkpython.fm/episodes/show/284/modern-and-fast-apis-with-fastapi",
    note: "Английский. Исторический обзор 2020 года, не инструкция по текущим версиям. Для синтаксиса используй документацию.",
    minutes: 20,
    minimum: 0,
  },
  {
    id: "docker-book",
    skills: ["docker"],
    kind: "book",
    title: "Docker in Action · второе издание",
    url: "https://www.manning.com/books/docker-in-action-second-edition",
    note: "Английский. Платная книга издателя; покупать необязательно. Версии команд сверяй с актуальной документацией.",
    minutes: 20,
    minimum: 35,
  },
];
export const findResource = (id: string) =>
  resourceCatalog.find((r) => r.id === id);
export function resourceCandidates(state: LearningState, skill: SkillId) {
  return resourceCatalog.filter(
    (r) =>
      r.skills.includes(skill) &&
      skillProgress(state, skill).mastery >= r.minimum,
  );
}
export function resourceSelection(
  state: LearningState,
  profile: LearningProfile,
  skill: SkillId,
  id: string,
  now: Date,
  chosen?: string[],
) {
  const candidates = resourceCandidates(state, skill);
  const rejected = new Set(
    state.resourceSelections.flatMap((s) =>
      s.items.filter((i) => i.helpful === false).map((i) => i.resourceId),
    ),
  );
  const minutes = availableToday(profile, now);
  const ids = chosen ?? [
    `${skill}-docs`,
    ...candidates
      .filter(
        (r) => r.kind !== "docs" && !rejected.has(r.id) && r.minutes <= minutes,
      )
      .slice(0, 1)
      .map((r) => r.id),
  ];
  const resources = ids.map((id) => candidates.find((r) => r.id === id));
  if (
    !ids.length ||
    ids.length > 3 ||
    new Set(ids).size !== ids.length ||
    resources.some((r) => !r)
  )
    throw new Error("Подбор содержит недоступный материал.");
  const kinds = resources.map((r) =>
    r!.kind === "book" || r!.kind === "podcast" ? "optional" : r!.kind,
  );
  if (new Set(kinds).size !== kinds.length || !kinds.includes("docs"))
    throw new Error(
      "Допустимы один основной источник, одно видео и один дополнительный материал.",
    );
  const short = curriculum.find((s) => s.id === skill)!.short;
  return {
    id,
    skill,
    at: now.toISOString(),
    source: chosen ? ("ai" as const) : ("prepared" as const),
    items: resources.map((r) => ({
      resourceId: r!.id,
      reason: `${short}: ${skillProgress(state, skill).mastery < 35 ? "закрепить основу перед следующей практикой" : "перенести знакомые понятия в проект"}. ${r!.kind === "docs" ? "Основной источник для проверки текущего задания." : "Дополнительно — другой способ разобраться в теме, не обязательное задание."} ${minutes === 0 ? "Сегодня день без занятий: можно сохранить на потом." : `Сегодня доступно ${minutes} мин; начни с одного фрагмента.`}`,
      savedAt: null,
      openedAt: null,
      helpful: null,
      feedbackAt: null,
    })),
  };
}
