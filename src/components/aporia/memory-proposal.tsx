"use client";
import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import {
  memoryCandidateSchema,
  type MemoryCandidate,
} from "@/lib/profile/memory";
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function MemoryProposal({
  disabled,
  version,
  onApply,
}: {
  disabled: boolean;
  version: number;
  onApply: (candidate: MemoryCandidate) => void;
}) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientReady,
    serverReady,
  );
  const [candidate, setCandidate] = useState<{
      value: MemoryCandidate;
      version: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function extract() {
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      const res = await fetch("/api/profile/extract", {
        method: "POST",
        signal: AbortSignal.any([
          controller.current.signal,
          AbortSignal.timeout(90000),
        ]),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setCandidate({
        value: memoryCandidateSchema.parse(body.candidate),
        version: body.version,
      });
    } catch (cause) {
      if (!controller.current?.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Повтори попытку.");
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<keyof MemoryCandidate, string> = {
    name: "Имя",
    occupation: "Работа",
    education: "Образование",
    goal_summary: "Пожелание",
    weekly_available_hours: "Часов в неделю",
    interests: "Интересы",
    hobbies: "Увлечения",
    learning_preferences: "Как учиться",
    preferred_session_length: "Минут на занятие",
    notes: "Заметки",
  };
  return (
    <div className="memory-proposal">
      <button
        type="button"
        className="secondary-button"
        disabled={!hydrated || disabled || busy}
        onClick={() => void extract()}
      >
        {busy ? "Собираем предложение…" : "Уточнить профиль из знакомства"}
      </button>
      <p className="quiet-copy">
        AI предложит структуру по твоим словам. Сначала проверь её; изменения
        применятся после сохранения профиля.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {candidate && (
        <div className="memory-review">
          <h3>Проверь, верно ли тебя понял AI</h3>
          <dl>
            {Object.entries(candidate.value).map(([key, value]) => (
              <div key={key}>
                <dt>{labels[key as keyof MemoryCandidate]}</dt>
                <dd>
                  {Array.isArray(value)
                    ? value.join(", ") || "Не указано"
                    : (value ?? "Не указано")}
                </dd>
              </div>
            ))}
          </dl>
          {candidate.version !== version && (
            <p role="alert">Профиль изменился. Запроси новое предложение.</p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={disabled || candidate.version !== version}
              onClick={() => {
                onApply(candidate.value);
                setCandidate(null);
              }}
            >
              Перенести в форму для проверки
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => setCandidate(null)}
            >
              Отклонить предложение
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
