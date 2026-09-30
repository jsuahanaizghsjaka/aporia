"use client";

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import { useLearning } from "./learning-provider";

export function SessionFeedback({ sessionId }: { sessionId: string }) {
  const { view, send, busy } = useLearning();
  const existing = view.state.sessionFeedback.find(
    (item) => item.session_id === sessionId,
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const note = draft ?? existing?.note ?? "";
  const dirty = note !== (existing?.note ?? "");

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(helpful: boolean) {
    setSaving(true);
    setFailed(false);
    const ok = await send({
      type: "session_feedback",
      session_id: sessionId,
      helpful,
      note,
    });
    setFailed(!ok);
    if (ok) setDraft(null);
    setSaving(false);
  }

  return (
    <section
      className="feedback-block session-feedback"
      aria-label="Отзыв о занятии"
      aria-busy={saving}
    >
      <h3>Было полезно?</h3>
      <p className="quiet-copy">
        Помоги нам улучшить занятия. Отзыв не влияет на оценку навыков.
      </p>
      <div
        className="segmented-actions"
        role="group"
        aria-label="Полезность занятия"
      >
        {([true, false] as const).map((helpful) => (
          <button
            key={String(helpful)}
            type="button"
            className="secondary-button"
            aria-pressed={existing?.helpful === helpful}
            disabled={busy || saving}
            onClick={() => void save(helpful)}
          >
            {helpful ? (
              <ThumbsUp size={20} aria-hidden="true" />
            ) : (
              <ThumbsDown size={20} aria-hidden="true" />
            )}
            {helpful ? "Да, полезно" : "Не очень"}
          </button>
        ))}
      </div>
      <label className="field-label">
        Почему? <span className="quiet-copy">Необязательно</span>
        <textarea
          rows={2}
          maxLength={500}
          name="session-feedback-note"
          autoComplete="off"
          value={note}
          disabled={busy || saving}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Например, не хватило примера с кодом…"
        />
      </label>
      {existing && dirty && (
        <button
          type="button"
          className="secondary-button"
          disabled={busy || saving}
          onClick={() => void save(existing.helpful)}
        >
          Сохранить комментарий
        </button>
      )}
      <p className="save-note" role="status">
        {saving
          ? "Сохраняем отзыв…"
          : failed
            ? "Отзыв не сохранён. Текст остался здесь, попробуй ещё раз."
            : dirty
              ? "Комментарий ещё не сохранён."
              : existing
                ? "Спасибо! Отзыв сохранён. Его можно изменить."
                : "Можно ответить без комментария."}
      </p>
    </section>
  );
}
