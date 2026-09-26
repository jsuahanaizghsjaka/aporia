"use client";
import { useState, type ReactNode } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { activeSession } from "@/lib/learning/selectors";
import { useLearning } from "./learning-provider";
import { ModeSwitch } from "./mode-switch";
export function LessonFlow({ children }: { children: ReactNode }) {
  const { view, send, busy } = useLearning();
  const lesson = activeSession(view.state)!.lesson!;
  const [reflection, setReflection] = useState(lesson.reflection ?? "");
  const steps = [
    ["theory", "Теория", lesson.plan.theory],
    ["exercise", "Практика", lesson.plan.exercise],
    ["project", "Применение", lesson.plan.project],
  ] as const;
  return (
    <div className="lesson-flow">
      {lesson.phase !== "exercise" && (
        <ModeSwitch
          mode={activeSession(view.state)!.mode}
          disabled={busy}
          onChange={(mode) => void send({ type: "set_mode", mode })}
        />
      )}
      <ol className="session-plan" aria-label="План занятия">
        {steps.map(([phase, title, minutes]) => (
          <li
            key={phase}
            aria-current={lesson.phase === phase ? "step" : undefined}
          >
            <strong>{title}</strong>
            <span>≈ {minutes} мин</span>
          </li>
        ))}
      </ol>
      {lesson.phase === "theory" ? (
        <section
          className="glass-panel exercise-panel lesson-theory"
          aria-labelledby="theory-title"
        >
          <p className="eyebrow">
            {lesson.teacher.source === "ai"
              ? "МЕНТОР ПОДОБРАЛ ОБЪЯСНЕНИЕ"
              : "ПОДГОТОВЛЕННЫЙ УРОК · БЕЗ AI"}
          </p>
          <h2 id="theory-title">Одна идея перед практикой</h2>
          <p className="preserve-lines">{lesson.teacher.explanation}</p>
          <p className="quiet-copy">Цель: {lesson.plan.goal}</p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void send({ type: "finish_theory" })}
          >
            Перейти к задаче <ArrowRight size={17} />
          </button>
        </section>
      ) : lesson.phase === "exercise" ? (
        children
      ) : (
        <section
          className="glass-panel exercise-panel"
          aria-labelledby="application-title"
        >
          <p className="eyebrow">ПРИМЕНИ К СВОЕМУ ПРОЕКТУ</p>
          <h2 id="application-title">Свяжем знание с задачей</h2>
          <p>{lesson.teacher.reflection}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (reflection.trim().length >= 20)
                await send({ type: "finish_project", reflection });
            }}
          >
            <label className="field-label">
              Код или объяснение применения
              <textarea
                rows={6}
                maxLength={4000}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                disabled={busy}
                required
                minLength={20}
              />
            </label>
            <p className="quiet-copy">
              Не меньше 20 символов. Сохраним заметку в занятии; уровень навыка
              определяется проверенной практикой.
            </p>
            <button
              className="primary-button"
              disabled={busy || reflection.trim().length < 20}
            >
              {busy ? "Сохраняем…" : "Завершить занятие"}
              <ArrowRight size={17} />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
