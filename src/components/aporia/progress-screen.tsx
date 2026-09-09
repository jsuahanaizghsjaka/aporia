"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChartLineUp,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import { curriculum } from "@/lib/learning/curriculum";
import {
  dueReviews,
  skillProgress,
  weeklyFocus,
  weeklySummary,
} from "@/lib/learning/selectors";
import type { SkillId } from "@/lib/learning/types";
import { useProfile } from "./profile-provider";
import { LearningGate, useLearning } from "./learning-provider";
import { Feedback } from "./practice";
const date = (value: string) =>
  new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const kinds = {
  diagnostic: "Диагностика",
  exercise: "Задание",
  review: "Повторение",
  project: "Проверка понимания проекта",
};
export function SkillRows({ resources = false }: { resources?: boolean }) {
  const { view, send } = useLearning();
  const { href } = useProfile();
  return (
    <div className="glass-panel skill-table">
      {curriculum.map((skill, index) => {
        const progress = skillProgress(view.state, skill.id);
        const prerequisite = curriculum.find(
          (item) => item.id === skill.prerequisite,
        );
        return (
          <section className="skill-row" key={skill.id}>
            <span className="curriculum-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="skill-copy">
              <h2>{skill.title}</h2>
              <p>{skill.detail}</p>
              {resources && prerequisite && (
                <small>Опора: {prerequisite.short}</small>
              )}
            </div>
            <div className="skill-signal">
              <strong>
                {progress.count ? `${progress.mastery}%` : "Нет данных"}
              </strong>
              <progress
                value={progress.mastery}
                max={100}
                aria-label={`${skill.short}: уровень владения`}
              />
              <small>
                {progress.count
                  ? `Уверенность ${progress.confidence}% · свидетельств ${progress.count}`
                  : "Появятся после практики"}
              </small>
            </div>
            {resources ? (
              <details className="resource-detail">
                <summary>Материал</summary>
                <p>
                  Основной источник · официальная документация. Открой нужный
                  раздел и вернись к заданию.
                </p>
                <a
                  className="text-link"
                  href={skill.resource}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    void send({ type: "resource_open", skill: skill.id })
                  }
                >
                  Открыть документацию
                  <ArrowUpRight size={15} />
                  <span className="sr-only">, в новой вкладке</span>
                </a>
                {view.state.diagnosticComplete && (
                  <Feedback target={`resource:${skill.id}`} />
                )}
              </details>
            ) : (
              progress.last && (
                <details className="evidence-detail">
                  <summary>Почему такой уровень?</summary>
                  <p>
                    Последний сигнал: {kinds[progress.last.kind]},{" "}
                    {date(progress.last.at)}.{" "}
                    {progress.last.correct
                      ? "Верный ответ"
                      : "Пока не получилось"}
                    ; самостоятельность{" "}
                    {Math.round(progress.last.independence * 100)}%.
                  </p>
                  <p>
                    Уровень учитывает правильность, помощь и накопленные
                    задания. Уверенность — объём и разнообразие проверок. Один
                    ответ не доказывает владение всей темой.
                  </p>
                  <Link className="text-link" href={href("/learn")}>
                    Продолжить практику
                    <ArrowRight size={15} />
                  </Link>
                </details>
              )
            )}
          </section>
        );
      })}
    </div>
  );
}
function WeeklyReview() {
  const { view, send, busy } = useLearning();
  const summary = weeklySummary(view.state, new Date());
  const suggestion = weeklyFocus(view.state, new Date());
  const [selectedFocus, setFocus] = useState<SkillId | null>(null);
  const focus = selectedFocus ?? view.state.focus ?? suggestion.skill;
  return (
    <section className="glass-panel weekly-panel">
      <div className="section-heading">
        <span className="eyebrow">ПОСЛЕДНИЕ 7 ДНЕЙ</span>
        <ClockCounterClockwise size={22} />
      </div>
      <h2>Небольшая пауза, чтобы увидеть путь.</h2>
      <div className="weekly-numbers">
        <div>
          <strong>{summary.sessions}</strong>
          <span>занятий завершено</span>
        </div>
        <div>
          <strong>{summary.independent}</strong>
          <span>верных ответов без помощи</span>
        </div>
        <div>
          <strong>{summary.evidence}</strong>
          <span>новых свидетельств</span>
        </div>
      </div>
      <p>
        {summary.evidence
          ? summary.changes
              .filter((item) => item.delta !== 0)
              .map(
                (item) =>
                  `${item.short}: ${item.delta > 0 ? "+" : ""}${item.delta} п. п.`,
              )
              .join(" · ") ||
            "Оценки стабильны. Повторение уточняет уверенность."
          : "Пока нет результатов за неделю. Обзор заполнится после первых ответов."}
      </p>
      <form
        className="focus-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send({ type: "set_focus", skill: focus });
        }}
      >
        <label className="field-label">
          Фокус следующей недели
          <select
            value={focus}
            onChange={(event) => setFocus(event.target.value as SkillId)}
          >
            {curriculum.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={busy || !view.state.diagnosticComplete}
        >
          Подтвердить фокус
          <ArrowRight size={16} />
        </button>
      </form>
      <p className="quiet-copy">
        {suggestion.fromFeedback
          ? "Учтён отзыв о сложном материале. "
          : "Предлагаем тему, которой полезно уделить внимание. "}
        Изменения применяются после подтверждения. Если основ пока мало, миссия
        сначала вернёт к ним.
      </p>
      {view.state.focus && (
        <p className="save-note" role="status">
          Текущий фокус:{" "}
          {curriculum.find((skill) => skill.id === view.state.focus)?.short}.
        </p>
      )}
    </section>
  );
}
function ProgressContent() {
  const { view } = useLearning();
  const { href } = useProfile();
  const now = new Date();
  const due = dueReviews(view.state, now);
  const next = Object.entries(view.state.reviews).sort((a, b) =>
    a[1].due.localeCompare(b[1].due),
  )[0];
  return (
    <>
      {!view.state.evidence.length && (
        <section className="glass-panel progress-empty">
          <ChartLineUp size={28} />
          <div>
            <h2>Пока нет результатов практики.</h2>
            <p>
              Уровни появятся после ответов. Просмотр материалов их не повышает.
            </p>
          </div>
          <Link className="secondary-button" href={href("/diagnostic")}>
            Начать
            <ArrowRight size={16} />
          </Link>
        </section>
      )}
      <SkillRows />
      <div className="review-callout">
        <div>
          <h2>
            {due.length
              ? `Пора повторить: ${due.length}`
              : "Повторение в твоём ритме"}
          </h2>
          <p>
            {due.length
              ? "Следующее занятие начнётся с заданий, к которым пора вернуться."
              : next
                ? `Ближайшее повторение — ${date(next[1].due)}.`
                : "После первого ответа вернёмся к теме через день."}
          </p>
        </div>
        <Link className="text-link" href={href("/learn")}>
          К занятию
          <ArrowRight size={16} />
        </Link>
      </div>
      <WeeklyReview />
      <section className="session-history">
        <div className="section-heading">
          <h2>История занятий</h2>
          <span className="quiet-copy">Последние 20</span>
        </div>
        {view.state.sessions.length ? (
          [...view.state.sessions]
            .reverse()
            .slice(0, 20)
            .map((session) => (
              <details className="glass-panel history-item" key={session.id}>
                <summary>
                  <span>
                    {session.kind === "diagnostic"
                      ? "Точка старта"
                      : session.kind === "review"
                        ? "Повторение"
                        : "Практика"}
                    <small>{date(session.startedAt)}</small>
                  </span>
                  <span>
                    {session.completedAt
                      ? `${session.results.filter((r) => r.correct).length} / ${session.questions.length} верно`
                      : "Можно продолжить"}
                  </span>
                </summary>
                <ul>
                  {session.results.map((result) => (
                    <li key={result.questionId}>
                      <strong>
                        {
                          curriculum.find((skill) =>
                            result.questionId.startsWith(`${skill.id}.`),
                          )?.short
                        }
                      </strong>
                      <span>
                        {result.correct ? "Верно" : "Нужна практика"} ·{" "}
                        {result.stage ? "с помощью" : "без подсказок"}
                      </span>
                      <code>{result.answer || "Пока не знаю"}</code>
                    </li>
                  ))}
                </ul>
                {session.completedAt ? (
                  <Feedback target={session.id} />
                ) : (
                  <Link
                    className="text-link"
                    href={href(
                      session.kind === "diagnostic" ? "/diagnostic" : "/learn",
                    )}
                  >
                    Продолжить занятие
                    <ArrowRight size={15} />
                  </Link>
                )}
              </details>
            ))
        ) : (
          <p className="quiet-copy">Здесь сохранятся занятия и твои ответы.</p>
        )}
      </section>
    </>
  );
}
export function ProgressScreen() {
  return (
    <div className="page-enter learning-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ПОДТВЕРЖДЕНО ПРАКТИКОЙ</p>
          <h1>Понимание оставляет след.</h1>
          <p>Что получилось, что требует внимания и когда вернуться к теме.</p>
        </div>
      </div>
      <LearningGate>
        <ProgressContent />
      </LearningGate>
    </div>
  );
}
