"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  Lightbulb,
  Clock,
  Target,
} from "@phosphor-icons/react";
import { useProfile } from "./profile-provider";
import { LearningGate, useLearning } from "./learning-provider";
import { activeSession } from "@/lib/learning/selectors";
import { useMission } from "./use-mission";
import { LessonFlow } from "./lesson-flow";
import { curriculum, teachingStages } from "@/lib/learning/curriculum";
import type { PublicQuestion } from "@/lib/learning/types";
import { useGoal } from "./goal-editor";
import { MentorChat } from "./mentor-chat";
import { ModeSwitch } from "./mode-switch";
import { ResourcesPanel } from "./resources-panel";
export function QuestionInput({
  question,
  value,
  onChange,
  disabled,
}: {
  question: PublicQuestion;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <h2 className="exercise-prompt">{question.prompt}</h2>
      {question.code && (
        <pre className="code-block">
          <code>{question.code}</code>
        </pre>
      )}
      {question.choices ? (
        <fieldset className="answer-options" disabled={disabled}>
          <legend className="sr-only">Выбери ответ</legend>
          {question.choices.map((choice, index) => (
            <label key={choice} className={value === choice ? "selected" : ""}>
              <input
                type="radio"
                name={`answer-${question.id}`}
                value={choice}
                checked={value === choice}
                onChange={() => onChange(choice)}
              />
              <span className="option-index">{index + 1}</span>
              <span>{choice}</span>
            </label>
          ))}
        </fieldset>
      ) : question.kind === "coding" ? (
        <label className="field-label">
          Твой код
          <textarea
            className="learning-input code-answer"
            name="code"
            rows={5}
            maxLength={1000}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
          />
        </label>
      ) : (
        <label className="field-label">
          Твой ответ
          <input
            className="learning-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Значение, ключевое слово или команда"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            maxLength={4000}
          />
        </label>
      )}
    </>
  );
}
export function Feedback({ target }: { target: string }) {
  const { view, send, busy } = useLearning();
  const existing = view.state.feedback.find((item) => item.target === target);
  const [note, setNote] = useState(existing?.note ?? "");
  return (
    <div className="feedback-block">
      <p>Как ощущалась сложность?</p>
      <label className="field-label">
        Комментарий, если хочется
        <textarea
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Что помогло или осталось непонятным?"
        />
      </label>
      <div className="segmented-actions">
        {(
          [
            ["hard", "Сложно"],
            ["right", "В самый раз"],
            ["easy", "Легко"],
          ] as const
        ).map(([rating, title]) => (
          <button
            key={rating}
            className="secondary-button"
            aria-pressed={existing?.rating === rating}
            disabled={busy}
            onClick={() =>
              void send({ type: "feedback", target, rating, note })
            }
          >
            {title}
          </button>
        ))}
      </div>
      {existing && (
        <p className="save-note" role="status">
          Обратная связь сохранена. Изменить фокус можно в недельном обзоре.
        </p>
      )}
    </div>
  );
}
function Exercise() {
  const { view, send, busy } = useLearning();
  const session = activeSession(view.state)!;
  const question = view.question!;
  const [answer, setAnswer] = useState("");
  const result = session.results[session.index];
  const lastAttempt = session.attempts
    ?.filter((item) => item.questionId === question.id)
    .at(-1);
  const credited = view.state.evidence.some(
    (item) => item.sessionId === session.id && item.questionId === question.id,
  );
  const diagnostic = session.kind === "diagnostic";
  const skill = curriculum.find((item) => item.id === question.skill)!;
  const labels = [
    "Первый намёк",
    "Ещё один намёк",
    "Объяснить принцип",
    "Часть решения",
    "Показать решение",
  ];
  return (
    <section
      className="glass-panel exercise-panel"
      aria-labelledby="exercise-heading"
    >
      <div className="exercise-meta">
        <span className="eyebrow" id="exercise-heading">
          {skill.short} ·{" "}
          {diagnostic
            ? "ДИАГНОСТИКА"
            : session.kind === "review"
              ? "ПОВТОРЕНИЕ"
              : "ПРАКТИКА"}
        </span>
        <span>
          {session.index + 1} / {session.questions.length}
        </span>
      </div>
      <progress
        className="lesson-progress"
        value={session.index}
        max={session.questions.length}
        aria-label="Пройденные задания"
      />
      {!diagnostic && (
        <ModeSwitch
          mode={session.mode}
          disabled={busy}
          onChange={(mode) => void send({ type: "set_mode", mode })}
        />
      )}
      {question.level && (
        <p className="quiet-copy">
          Уровень:{" "}
          {
            {
              foundation: "основы",
              practice: "практика",
              challenge: "углубление",
            }[question.level]
          }{" "}
          · проверяемый шаблон
        </p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (answer.trim() && !result) await send({ type: "answer", answer });
        }}
      >
        <QuestionInput
          question={question}
          value={result?.answer ?? answer}
          onChange={setAnswer}
          disabled={busy || !!result}
        />
        {!result && (
          <div className="exercise-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={busy || !answer.trim()}
            >
              {busy
                ? "Сохраняем…"
                : diagnostic
                  ? "Ответить"
                  : "Проверить ответ"}
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => void send({ type: "answer", answer: "" })}
            >
              Пока не знаю
            </button>
          </div>
        )}
      </form>
      {!result && lastAttempt && (
        <p className="attempt-feedback" role="status">
          Пока неверно. Попробуй ещё раз с подсказкой ниже. Попытка сохранена.
        </p>
      )}
      {diagnostic ? (
        <p className="quiet-copy">
          Здесь нет подсказок. Один вопрос даёт лишь предварительный сигнал о
          навыке.
        </p>
      ) : (
        <>
          {!result && (
            <div className="teaching-bar">
              <span>
                <Lightbulb size={17} />
                {session.mode === "help"
                  ? "Help · прямой разбор"
                  : `Learn · ${teachingStages[session.stage]}`}
              </span>
              <button
                className="text-link"
                disabled={busy || session.stage === 5}
                onClick={() => void send({ type: "hint" })}
              >
                {session.stage === 5
                  ? "Решение открыто"
                  : session.mode === "help"
                    ? "Показать решение"
                    : labels[session.stage]}
              </button>
            </div>
          )}
          {view.help && !result && (
            <aside className="hint-panel" aria-live="polite">
              <p>{view.help}</p>
              {session.stage >= 4 && (
                <small>
                  После открытого решения вернёмся к заданию без помощи на
                  повторении.
                </small>
              )}
            </aside>
          )}
          {result && (
            <div
              className={`answer-result ${result.correct ? "correct" : ""}`}
              role="status"
            >
              <h3>
                {result.correct ? "Ответ верный." : "Нашли место для практики."}
              </h3>
              <p className="preserve-lines">{view.solution}</p>
              <p>
                {!credited
                  ? "Ответ сохранён. До назначенного повторения это задание не повышает уровень повторно."
                  : result.stage
                    ? "Помощь учтена: самостоятельность подтвердим на повторении."
                    : result.correct
                      ? "Сохранено подтверждение самостоятельного ответа."
                      : "Ответ сохранён. Повторим задание завтра."}
              </p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void send({ type: "next" })}
              >
                {session.index + 1 === session.questions.length
                  ? session.lesson
                    ? "Перейти к применению"
                    : "Завершить занятие"
                  : "Следующее задание"}
                <ArrowRight size={17} />
              </button>
            </div>
          )}
        </>
      )}
      <p className="quiet-copy">
        Ответы проверяются по учебному эталону. Произвольный код на сервере не
        запускается.
      </p>
    </section>
  );
}
function StartGate({ diagnostic = false }: { diagnostic?: boolean }) {
  const { profile, href, preview } = useProfile();
  const { view, send, busy } = useLearning();
  const goalState = useGoal();
  const [mode, setMode] = useState<"learn" | "help">("learn");
  const [minutes, setMinutes] = useState(profile.dailyMinutes);
  const [teacher, setTeacher] = useState<"ai" | "prepared">(
    preview ? "prepared" : "ai",
  );
  const missionState = useMission(minutes);
  if (!profile.onboardingComplete)
    return (
      <section className="glass-panel empty-panel">
        <Target size={30} />
        <h2>Сначала определим твою цель.</h2>
        <p>Подтверди профиль, чтобы занятия соответствовали твоему ритму.</p>
        <Link className="primary-button" href={href("/onboarding")}>
          Познакомиться
          <ArrowRight size={17} />
        </Link>
      </section>
    );
  if (!diagnostic && !view.state.diagnosticComplete)
    return (
      <section className="glass-panel empty-panel">
        <h2>Начнём с точки старта.</h2>
        <p>Девять небольших заданий помогут понять, что уже получается.</p>
        <Link className="primary-button" href={href("/diagnostic")}>
          Пройти диагностику
          <ArrowRight size={17} />
        </Link>
      </section>
    );
  if (diagnostic && (!goalState.loaded || goalState.error || !goalState.goal))
    return (
      <section className="glass-panel empty-panel">
        <h2>
          {!goalState.loaded
            ? "Загружаем цель…"
            : "Сначала выберем результат обучения."}
        </h2>
        {goalState.error ? (
          <p role="alert">
            {goalState.error}{" "}
            <button
              className="text-link"
              onClick={() => void goalState.refresh()}
            >
              Повторить
            </button>
          </p>
        ) : (
          <p>Подтверди одну цель и критерии успеха в профиле.</p>
        )}
        <Link className="primary-button" href={href("/profile") + "#goal"}>
          Определить цель
        </Link>
      </section>
    );
  const mission = missionState.mission;
  return (
    <section className="glass-panel session-start">
      <span className="quiet-badge">
        <Clock size={15} />
        {diagnostic ? 10 : mission.estimated_time} минут
      </span>
      <h2>
        {diagnostic
          ? "Не экзамен. Знакомство с твоими навыками."
          : mission.title}
      </h2>
      <p>
        {diagnostic
          ? "Девять заданий по восьми темам: выбор ответа, короткий ответ, чтение кода и небольшая функция. Отвечай самостоятельно; если тема новая, выбери «Пока не знаю». Уйти и продолжить позже можно в любой момент."
          : mission.reason}
      </p>
      {!diagnostic && (
        <div className="lesson-settings">
          <label className="field-label">
            Сколько времени есть сейчас?
            <select
              value={minutes}
              disabled={busy}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[
                ...new Set([
                  5,
                  10,
                  15,
                  20,
                  25,
                  30,
                  45,
                  60,
                  90,
                  120,
                  profile.dailyMinutes,
                ]),
              ]
                .sort((a, b) => a - b)
                .map((v) => (
                  <option key={v} value={v}>
                    {v} минут
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            Объяснение
            <select
              value={teacher}
              disabled={busy || preview}
              onChange={(e) => setTeacher(e.target.value as "ai" | "prepared")}
            >
              <option value="ai">Подобрать с AI-ментором</option>
              <option value="prepared">Подготовленный урок без AI</option>
            </select>
          </label>
          <p className="quiet-copy">
            Теория ≈ {mission.theory} мин · практика ≈ {mission.exercise} мин ·
            применение ≈ {mission.project} мин
          </p>
          {missionState.error && (
            <p role="alert">
              {missionState.error}{" "}
              <button
                className="text-link"
                onClick={() => void missionState.refresh()}
              >
                Загрузить ещё раз
              </button>
            </p>
          )}
        </div>
      )}
      {!diagnostic && (
        <fieldset className="mode-choice">
          <legend>Как будем разбираться?</legend>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "learn"}
              onChange={() => setMode("learn")}
            />
            <strong>Learn</strong>
            <span>Думаем вместе, от намёка к решению</span>
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "help"}
              onChange={() => setMode("help")}
            />
            <strong>Help</strong>
            <span>Можно сразу открыть прямой разбор</span>
          </label>
        </fieldset>
      )}
      <button
        className="primary-button"
        disabled={
          busy ||
          (!diagnostic &&
            (missionState.loading ||
              !!missionState.error ||
              mission.estimated_time === 0))
        }
        onClick={() =>
          void send(
            diagnostic
              ? { type: "start_diagnostic" }
              : { type: "start_lesson", mode, minutes, teacher },
          )
        }
      >
        {busy
          ? "Готовим занятие…"
          : diagnostic
            ? "Начать диагностику"
            : "Начать занятие"}
        <ArrowRight size={17} />
      </button>
    </section>
  );
}
function DiagnosticContent() {
  const { view } = useLearning();
  const { href } = useProfile();
  const session = activeSession(view.state);
  if (session?.kind === "diagnostic")
    return <Exercise key={`${session.id}:${session.index}`} />;
  if (view.state.diagnosticComplete) {
    const result = view.state.sessions.find(
      (item) => item.kind === "diagnostic",
    )!;
    return (
      <section className="glass-panel diagnostic-results">
        <CheckCircle size={32} weight="light" />
        <h2>Точка старта найдена.</h2>
        <p>
          Это предварительная оценка. Следующие занятия проверят глубину
          понимания и уточнят маршрут.
        </p>
        <div className="diagnostic-grid">
          {result.results.map((answer) => (
            <div key={answer.questionId}>
              <span>
                {
                  curriculum.find((skill) =>
                    answer.questionId.startsWith(`${skill.id}.`),
                  )?.short
                }
              </span>
              <span className={answer.correct ? "result-good" : "quiet-copy"}>
                {answer.correct ? "Есть опора" : "Начнём с основ"}
              </span>
            </div>
          ))}
        </div>
        <Link className="primary-button" href={href("/learn")}>
          Перейти к практике
          <ArrowRight size={17} />
        </Link>
      </section>
    );
  }
  return <StartGate diagnostic />;
}
export function DiagnosticScreen() {
  return (
    <div className="page-enter learning-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ТОЧКА СТАРТА</p>
          <h1>Что уже получается?</h1>
          <p>Ответы важнее самооценки. Начнём оттуда, где ты сейчас.</p>
        </div>
      </div>
      <LearningGate>
        <DiagnosticContent />
      </LearningGate>
    </div>
  );
}
function PracticeContent() {
  const { view } = useLearning();
  const { href } = useProfile();
  const session = activeSession(view.state);
  const last = view.state.sessions
    .filter((item) => item.completedAt && item.kind !== "diagnostic")
    .at(-1);
  if (session?.kind === "diagnostic")
    return (
      <section className="glass-panel empty-panel">
        <h2>Продолжим диагностику.</h2>
        <p>У тебя одно активное занятие. Сначала завершим его.</p>
        <Link className="primary-button" href={href("/diagnostic")}>
          Продолжить
          <ArrowRight size={17} />
        </Link>
      </section>
    );
  return (
    <>
      {session ? (
        session.lesson ? (
          <LessonFlow key={session.id}>
            {view.question && (
              <Exercise key={`${session.id}:${session.index}`} />
            )}
          </LessonFlow>
        ) : (
          <Exercise key={`${session.id}:${session.index}`} />
        )
      ) : (
        <>
          {last && (
            <section className="glass-panel session-recap">
              <span className="eyebrow">ПОСЛЕДНЕЕ ЗАНЯТИЕ</span>
              <h2>Есть шаг вперёд.</h2>
              <p>
                {last.results.filter((r) => r.correct).length} из{" "}
                {last.questions.length} ответов верны. Сохранили результаты и
                назначили повторение.
              </p>
              <Feedback key={last.id} target={last.id} />
              <Link className="text-link" href={href("/progress")}>
                Посмотреть, что изменилось
                <ArrowUpRight size={15} />
              </Link>
            </section>
          )}
          <StartGate />
        </>
      )}
      {!session && (
        <details className="glass-panel mentor-details">
          <summary>
            Обсудить вопрос с ментором<span>Цель, теория или идея проекта</span>
          </summary>
          <MentorChat />
        </details>
      )}
    </>
  );
}
export function PracticeScreen() {
  return (
    <div className="page-enter learning-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">МАЛЕНЬКИЙ ШАГ · НАСТОЯЩЕЕ ПОНИМАНИЕ</p>
          <h1>Время разобраться.</h1>
          <p>Одно занятие, твой темп. Возвращайся с того же места.</p>
        </div>
      </div>
      <LearningGate>
        <PracticeContent />
        <ResourcesPanel />
      </LearningGate>
    </div>
  );
}
