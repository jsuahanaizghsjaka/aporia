"use client";
import { useState } from "react";
import Link from "next/link";
import { useProfile } from "./profile-provider";
import { LearningGate, useLearning } from "./learning-provider";
import { Feedback } from "./practice";
import type { Evidence, Session } from "@/lib/learning/types";
import {
  durationLabel,
  evidenceDelta,
  evidenceKinds,
  formatHistoryDate as date,
  sessionHistory,
  signedDelta,
} from "@/lib/learning/history";

export function EvidenceList({ entries }: { entries: Evidence[] }) {
  const { view } = useLearning();
  const { href } = useProfile();
  const [limit, setLimit] = useState(10);
  const ordered = [...entries].reverse();
  return (
    <div className="evidence-ledger">
      <p className="quiet-copy">
        Источник, ответ и показанная помощь объясняют оценку. Просмотр
        материалов и самоотчёт не добавляют баллы.
      </p>
      <ol>
        {ordered.slice(0, limit).map((e) => (
          <li key={e.id}>
            <strong>
              {evidenceKinds[e.kind]} · {e.correct ? "Верно" : "Нужна практика"}
            </strong>
            <span>
              {date(e.mastery_changes?.at(-1)?.at ?? e.at)} · самостоятельность{" "}
              {Math.round(e.independence * 100)}%
            </span>
            <span>
              {e.history_complete
                ? `Изменение mastery: ${signedDelta(evidenceDelta(e))}`
                : "Ранняя запись: точное изменение mastery не сохранено"}
            </span>
            <details>
              <summary>Источник и изменения оценки</summary>
              <p>
                Ответ:{" "}
                <code>
                  {e.answer === undefined
                    ? "Не записан в ранней версии"
                    : e.answer || "Пока не знаю"}
                </code>
              </p>
              <p className="source-id">
                Источник: <code>{e.source_id ?? e.id}</code>
              </p>
              <p>
                Первое наблюдение: {date(e.at)}. Задание:{" "}
                <code>{e.questionId}</code>.
              </p>
              {e.mastery_changes?.map((c, i) => (
                <p key={i}>
                  {date(c.at)}: {c.before}% → {c.after}% (
                  {signedDelta(c.after - c.before)})
                </p>
              ))}
            </details>
            {view.state.sessions.some((s) => s.id === e.sessionId) ? (
              <Link
                className="text-link"
                href={href(`/progress/sessions/${e.sessionId}`)}
              >
                Открыть занятие
              </Link>
            ) : e.kind === "project" ? (
              <Link className="text-link" href={href("/projects")}>
                К проекту
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      {ordered.length > limit && (
        <button
          className="secondary-button"
          onClick={() => setLimit((n) => n + 10)}
        >
          Ещё свидетельства ({ordered.length - limit})
        </button>
      )}
    </div>
  );
}
function MasteryChanges({ session }: { session: Session }) {
  const { view } = useLearning();
  const h = sessionHistory(view.state, session);
  return (
    <div className="session-mastery">
      <h3>Изменение mastery</h3>
      {h.complete ? (
        <p>
          {h.changes
            .map((c) => `${c.title}: ${signedDelta(c.delta)}`)
            .join(" · ") || "Без изменения"}
        </p>
      ) : (
        <p>
          Точное изменение не записано для части ранних ответов. Текущий уровень
          по ним сохранён; историю оценок задним числом не придумываем.
        </p>
      )}
      <p className="quiet-copy">
        Изменение относится только к ответам этого занятия. Отрицательное
        значение тоже возможно: новая проверка уточняет оценку.
      </p>
    </div>
  );
}
export function SessionBody({ session }: { session: Session }) {
  const { view } = useLearning();
  const { href } = useProfile();
  return (
    <div className="session-body">
      <MasteryChanges session={session} />
      {session.lesson && (
        <div className="session-plan-summary">
          <p className="quiet-copy">
            План: {session.lesson.plan.estimated_time} мин · теория{" "}
            {session.lesson.plan.theory} · практика{" "}
            {session.lesson.plan.exercise} · применение{" "}
            {session.lesson.plan.project}.
          </p>
          <details>
            <summary>Теория этого занятия</summary>
            <p className="preserve-lines">
              {session.lesson.teacher.explanation}
            </p>
          </details>
          {session.lesson.reflection && (
            <div>
              <h3>Применение к проекту</h3>
              <p className="preserve-lines">{session.lesson.reflection}</p>
            </div>
          )}
        </div>
      )}
      <h3>Результаты ответов</h3>
      {!session.results.length && <p>Завершённых ответов пока нет.</p>}
      <ul>
        {session.results.map((result) => (
          <li key={result.questionId}>
            <strong>
              {result.skill_id ?? result.questionId.split(".")[0]}
            </strong>
            <span>
              {result.correct ? "Верно" : "Нужна практика"} ·{" "}
              {result.stage ? "с помощью" : "без подсказок"}
            </span>
            <code>{result.answer || "Пока не знаю"}</code>
          </li>
        ))}
      </ul>
      {!!session.attempts?.length && (
        <details>
          <summary>Все попытки · {session.attempts.length}</summary>
          <ul>
            {session.attempts.map((a, i) => (
              <li key={i}>
                <strong>{a.skill_id ?? a.questionId.split(".")[0]}</strong>
                <span>
                  {a.correct ? "Верно" : "Нужна практика"} · помощь{" "}
                  {a.hints_used ?? a.stage}/5 ·{" "}
                  {a.time_spent === undefined
                    ? "Время не записано"
                    : `${a.time_spent} с от открытия задания`}
                </span>
                <code>{a.answer || "Пока не знаю"}</code>
              </li>
            ))}
          </ul>
          <p className="quiet-copy">
            Время до попытки включает паузы, максимум 2 часа. Повторные
            интервалы не складываются как активное время.
          </p>
        </details>
      )}
      <details>
        <summary>Доказательства навыка этого занятия</summary>
        <EvidenceList
          entries={view.state.evidence.filter(
            (e) => e.sessionId === session.id,
          )}
        />
      </details>
      {session.completedAt ? (
        <Feedback target={session.id} />
      ) : view.state.activeSession === session.id ? (
        <Link
          className="text-link"
          href={href(session.kind === "diagnostic" ? "/diagnostic" : "/learn")}
        >
          Продолжить занятие
        </Link>
      ) : (
        <p>Это занятие сейчас не активно.</p>
      )}
    </div>
  );
}
export function LearningHistory() {
  const { view } = useLearning();
  const { href } = useProfile();
  const [limit, setLimit] = useState(20);
  const sessions = [...view.state.sessions].reverse();
  return (
    <section className="session-history" aria-labelledby="history-title">
      <div className="section-heading">
        <h2 id="history-title">История занятий</h2>
        <span className="quiet-copy">Всего {sessions.length}</span>
      </div>
      <p className="quiet-copy">
        Длительность — время между началом и завершением, включая перерывы. План
        показывается отдельно.
      </p>
      {sessions.length ? (
        sessions.slice(0, limit).map((session) => {
          const h = sessionHistory(view.state, session);
          return (
            <details className="glass-panel history-item" key={session.id}>
              <summary>
                <span>
                  {session.kind === "diagnostic"
                    ? "Точка старта"
                    : session.kind === "review"
                      ? "Повторение"
                      : "Практика"}
                  <small>
                    {date(session.startedAt)} · {h.topic}
                  </small>
                  <small>Длительность: {durationLabel(h.seconds)}</small>
                </span>
                <span>
                  {session.completedAt
                    ? `${h.correct} / ${h.total} верно`
                    : "Можно продолжить"}
                </span>
              </summary>
              <Link
                className="text-link session-permalink"
                href={href(`/progress/sessions/${session.id}`)}
              >
                Открыть занятие
              </Link>
              <SessionBody session={session} />
            </details>
          );
        })
      ) : (
        <p className="quiet-copy">Здесь сохранятся занятия и твои ответы.</p>
      )}
      {sessions.length > limit && (
        <button
          className="secondary-button"
          onClick={() => setLimit((n) => n + 20)}
        >
          Ещё занятия ({sessions.length - limit})
        </button>
      )}
    </section>
  );
}
function SessionContent({ id }: { id: string }) {
  const { view } = useLearning();
  const { href } = useProfile();
  const session = view.state.sessions.find((s) => s.id === id);
  if (!session)
    return (
      <section className="glass-panel progress-empty">
        <p role="alert">Занятие не найдено в твоей истории.</p>
        <Link className="text-link" href={href("/progress")}>
          К прогрессу
        </Link>
      </section>
    );
  const h = sessionHistory(view.state, session);
  return (
    <article className="glass-panel history-item session-detail">
      <Link className="text-link" href={href("/progress")}>
        ← К прогрессу и истории
      </Link>
      <h1>Занятие: {h.topic}</h1>
      <p>
        {date(session.startedAt)} ·{" "}
        {session.completedAt ? "Завершено" : "Не завершено"}
      </p>
      <p>
        Длительность: {durationLabel(h.seconds)} · План: {session.minutes} мин
      </p>
      <p>
        Результат: {h.correct} / {h.total} верно · Режим:{" "}
        {session.mode === "learn" ? "Learn" : "Help"}
      </p>
      <p className="quiet-copy">
        Длительность включает перерывы. Просмотр истории не меняет mastery и не
        начинает новое занятие.
      </p>
      <SessionBody session={session} />
    </article>
  );
}
export function SessionScreen({ id }: { id: string }) {
  return (
    <div className="page-enter learning-page">
      <LearningGate>
        <SessionContent id={id} />
      </LearningGate>
    </div>
  );
}
