"use client";
import { useId, useState } from "react";
import type { SkillId } from "@/lib/learning/types";
import { useLearning } from "./learning-provider";
import { useProfile } from "./profile-provider";
import { ModeSwitch } from "./mode-switch";
export function ProjectMentor({ skill }: { skill: SkillId }) {
  const formId = useId();
  const { view, send, busy, askProject, cancelProject } = useLearning();
  const { preview } = useProfile();
  const [message, setMessage] = useState(""),
    [decision, setDecision] = useState(""),
    [asking, setAsking] = useState(false);
  const p = view.state.project!;
  const messages = (p.messages ?? []).filter((m) => m.skill === skill);
  return (
    <section className="project-mentor" aria-labelledby="project-mentor-title">
      <h3 id="project-mentor-title">Чат по текущей задаче</h3>
      <ModeSwitch
        label="Режим проектного ментора"
        mode={p.mode ?? "learn"}
        disabled={busy}
        onChange={(mode) => void send({ type: "set_project_mode", mode })}
      />
      <p className="quiet-copy">
        Ментор видит сохранённый код этой задачи и подтверждённые решения. Не
        отправляй пароли или ключи. Код не запускается.
      </p>
      <div
        className="project-conversation"
        role="log"
        aria-label="История проектного чата"
        aria-live="polite"
      >
        {messages.length ? (
          messages.map((m) => (
            <article key={m.id}>
              <p>
                <strong>Ты · {m.mode === "learn" ? "Learn" : "Help"}</strong>
              </p>
              <p className="preserve-lines">{m.question}</p>
              <p>
                <strong>Ментор</strong>
              </p>
              <p className="preserve-lines">{m.reply}</p>
              {m.decision && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setDecision(m.decision!)}
                >
                  Перенести предложение в черновик решения
                </button>
              )}
            </article>
          ))
        ) : (
          <p className="quiet-copy">
            Задай вопрос о текущем шаге. Переписка сохранится в проекте.
          </p>
        )}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setAsking(true);
          try {
            if (await askProject(skill, message)) setMessage("");
          } finally {
            setAsking(false);
          }
        }}
      >
        <div className="field-label">
          <label htmlFor={`${formId}-question`}>Вопрос ментору</label>
          <textarea
            id={`${formId}-question`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            minLength={3}
            maxLength={2000}
            disabled={busy}
            required
          />
        </div>
        <div className="exercise-actions">
          <button
            className="primary-button"
            disabled={
              busy ||
              message.trim().length < 3 ||
              preview ||
              !!view.state.activeSession ||
              (p.messages?.length ?? 0) >= 100
            }
          >
            {asking ? "Ментор думает…" : "Спросить ментора"}
          </button>
          {asking && (
            <button
              type="button"
              className="secondary-button"
              onClick={cancelProject}
            >
              Отменить запрос
            </button>
          )}
        </div>
        {preview && (
          <p className="quiet-copy">
            AI-чат не работает в preview; нужен аккаунт с подключённым AI.
          </p>
        )}
        {view.state.activeSession && (
          <p className="quiet-copy">
            Заверши активное занятие, чтобы открыть проектный чат.
          </p>
        )}
      </form>
      <h3>Решения проекта</h3>
      <p className="quiet-copy">
        Сохраняются только после твоего подтверждения. AI-предложение можно
        исправить.
      </p>
      <ul>
        {(p.decisions ?? [])
          .filter((d) => d.skill === skill)
          .map((d) => (
            <li key={d.id} className="preserve-lines">
              {d.text}
            </li>
          ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await send({ type: "save_decision", skill, text: decision }))
            setDecision("");
        }}
      >
        <div className="field-label">
          <label htmlFor={`${formId}-decision`}>
            Черновик технического решения
          </label>
          <textarea
            id={`${formId}-decision`}
            rows={3}
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            minLength={5}
            maxLength={1000}
            required
            disabled={busy}
          />
        </div>
        <button
          className="secondary-button"
          disabled={
            busy ||
            decision.trim().length < 5 ||
            (p.decisions?.length ?? 0) >= 30
          }
        >
          Подтвердить решение
        </button>
      </form>
    </section>
  );
}
