"use client";
import { uiError } from "@/lib/ui-error";
import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  goalDraftSchema,
  goalRecordSchema,
  type GoalRecord,
} from "@/lib/goals/schema";
import { commitPreview } from "@/lib/preview-storage";
import { useProfile } from "./profile-provider";
const storageKey = "aporia:preview:goal:v1";
export function useGoal() {
  const { preview } = useProfile();
  const [state, setState] = useState<{
    goal: GoalRecord | null;
    error: string;
    loaded: boolean;
  }>({ goal: null, error: "", loaded: false });
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        let goal: GoalRecord | null;
        if (preview) {
          const raw = localStorage.getItem(storageKey);
          goal = raw ? goalRecordSchema.parse(JSON.parse(raw)) : null;
        } else {
          const res = await fetch("/api/goals", {
            cache: "no-store",
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
              : AbortSignal.timeout(20000),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          goal = body.goal ? goalRecordSchema.parse(body.goal) : null;
        }
        if (!signal?.aborted) setState({ goal, error: "", loaded: true });
      } catch (cause) {
        if (!signal?.aborted)
          setState((s) => ({
            ...s,
            loaded: true,
            error: uiError(
              cause,
              "Не удалось загрузить цель. Повтори попытку.",
            ),
          }));
      }
    },
    [preview],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  return { ...state, refresh };
}
export function GoalSummary() {
  const { goal, error, loaded, refresh } = useGoal();
  const { href } = useProfile();
  return (
    <section className="glass-panel goal-panel" aria-label="Учебная цель">
      <span className="eyebrow">ТВОЯ УЧЕБНАЯ ЦЕЛЬ</span>
      <h2>
        {loaded
          ? (goal?.summary ?? "Какой результат ты хочешь получить?")
          : "Загружаем цель…"}
      </h2>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button className="text-link" onClick={() => void refresh()}>
            Повторить
          </button>
        </p>
      ) : goal ? (
        <>
          <ul>
            {goal.success_criteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {goal.target_date && (
            <p>
              Срок:{" "}
              {new Intl.DateTimeFormat("ru", {
                dateStyle: "long",
                timeZone: "UTC",
              }).format(new Date(goal.target_date + "T00:00:00Z"))}
            </p>
          )}
        </>
      ) : (
        <p>Сформулируй цель и критерии результата перед диагностикой.</p>
      )}
      <Link className="text-link" href={href("/profile") + "#goal"}>
        {goal ? "Изменить цель" : "Определить цель"}
      </Link>
    </section>
  );
}
function GoalForm({
  initial,
  onSaved,
}: {
  initial: GoalRecord | null;
  onSaved: () => Promise<void>;
}) {
  const { preview, profile } = useProfile();
  const [summary, setSummary] = useState(initial?.summary ?? ""),
    [criteria, setCriteria] = useState(
      initial?.success_criteria.join("\n") ?? "",
    ),
    [date, setDate] = useState(initial?.target_date ?? ""),
    [wish, setWish] = useState(profile.goal),
    [busy, setBusy] = useState(false),
    [refining, setRefining] = useState(false),
    [error, setError] = useState(""),
    [proposal, setProposal] = useState(false),
    [dirty, setDirty] = useState(false),
    [saved, setSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null),
    pending = useRef<{ signature: string; id: string } | null>(null);
  const aiController = useRef<AbortController | null>(null);
  useEffect(() => () => aiController.current?.abort(), []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change() {
    setDirty(true);
    setSaved(false);
  }
  async function refine() {
    if (aiController.current || busy) return;
    const active = new AbortController();
    aiController.current = active;
    setRefining(true);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/goals/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wish }),
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(85000)]),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      const candidate = goalDraftSchema.parse(body.candidate);
      setSummary(candidate.summary);
      setCriteria(candidate.success_criteria.join("\n"));
      setProposal(true);
      change();
    } catch (cause) {
      setError(
        active.signal.aborted
          ? "Предложение отменено. Твоя цель не изменена."
          : uiError(cause),
      );
    } finally {
      aiController.current = null;
      setRefining(false);
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const parsed = goalDraftSchema.safeParse({
      summary,
      success_criteria: criteria
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      target_date: date || null,
    });
    if (!parsed.success) {
      setError(
        "Укажи результат (8–500 символов), 1–5 разных критериев по 5–300 символов и корректную дату или оставь её пустой.",
      );
      const name = String(parsed.error.issues[0]?.path[0]);
      form.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const signature = JSON.stringify(parsed.data);
      if (pending.current?.signature !== signature)
        pending.current = { signature, id: crypto.randomUUID() };
      if (preview) {
        const before = localStorage.getItem(storageKey);
        const old = before ? goalRecordSchema.parse(JSON.parse(before)) : null;
        if ((old?.version ?? 0) !== (initial?.version ?? 0))
          throw new Error(
            "Цель изменена в другой вкладке. Обнови сохранённую версию.",
          );
        const perform = () =>
          commitPreview(localStorage, storageKey, before, async () => ({
            value: JSON.stringify({
              ...parsed.data,
              id: initial?.id ?? crypto.randomUUID(),
              version: (initial?.version ?? 0) + 1,
              updated_at: new Date().toISOString(),
            }),
            result: true,
          }));
        if (navigator.locks) await navigator.locks.request(storageKey, perform);
        else await perform();
      } else {
        const res = await fetch("/api/goals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...parsed.data,
            version: initial?.version ?? 0,
            requestId: pending.current.id,
          }),
          signal: AbortSignal.timeout(30000),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        goalRecordSchema.parse(body.goal);
      }
      setDirty(false);
      setProposal(false);
      setSaved(true);
      pending.current = null;
      await onSaved();
    } catch (cause) {
      setError(uiError(cause, "Не удалось сохранить цель. Повтори попытку."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form ref={form} onSubmit={save} aria-busy={busy}>
      {refining && (
        <button
          className="text-link"
          type="button"
          onClick={() => aiController.current?.abort()}
        >
          Отменить предложение AI
        </button>
      )}
      <fieldset
        disabled={busy || !profile.onboardingComplete}
        className="goal-fields"
      >
        <label className="form-field">
          Пожелание для AI
          <textarea
            name="wish"
            autoComplete="off"
            maxLength={1000}
            value={wish}
            onChange={(e) => setWish(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={preview || busy || wish.trim().length < 3}
          onClick={() => void refine()}
        >
          {busy ? "Обрабатываем…" : "Уточнить цель с AI"}
        </button>
        {preview && (
          <p className="quiet-copy">
            В предпросмотре сформулируй цель вручную. AI доступен после входа.
          </p>
        )}
        {proposal && (
          <p role="status" className="notice">
            Предложение AI ещё не сохранено. Проверь и исправь результат,
            критерии и срок.
          </p>
        )}
        <label className="form-field">
          Измеримый результат
          <textarea
            name="summary"
            autoComplete="off"
            required
            minLength={8}
            maxLength={500}
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              change();
            }}
          />
        </label>
        <label className="form-field">
          Критерии успеха — каждый с новой строки
          <textarea
            name="success_criteria"
            autoComplete="off"
            required
            maxLength={1504}
            rows={4}
            value={criteria}
            onChange={(e) => {
              setCriteria(e.target.value);
              change();
            }}
          />
        </label>
        <label className="form-field">
          Желаемая дата — необязательно
          <input
            name="target_date"
            autoComplete="off"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              change();
            }}
          />
        </label>
        <div className="form-actions">
          <button className="primary-button" disabled={busy}>
            {busy ? "Сохраняем…" : "Подтвердить цель"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSummary(initial?.summary ?? "");
              setCriteria(initial?.success_criteria.join("\n") ?? "");
              setDate(initial?.target_date ?? "");
              setDirty(false);
              setError("");
              setProposal(false);
            }}
          >
            Отменить правки цели
          </button>
        </div>
      </fieldset>
      {!profile.onboardingComplete && (
        <p className="notice">
          Сначала заверши знакомство и подтверди профиль.
        </p>
      )}
      {error && (
        <div role="alert" className="error-message">
          {error}{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => void onSaved()}
          >
            Загрузить сохранённую версию
          </button>
          <p>
            Перед загрузкой скопируй нужные правки: сохранённая версия заменит
            поля формы.
          </p>
        </div>
      )}
      {saved && <p role="status">Цель сохранена.</p>}
    </form>
  );
}
export function GoalEditor() {
  const state = useGoal();
  return (
    <section id="goal" className="glass-panel goal-panel">
      <span className="eyebrow">КУДА ДВИЖЕМСЯ</span>
      <h2>Один ясный результат.</h2>
      <p>
        Пожелание из знакомства превращаем в учебную цель. Ты выбираешь
        формулировку и срок.
      </p>
      {state.error ? (
        <p role="alert">
          {state.error}{" "}
          <button
            className="secondary-button"
            onClick={() => void state.refresh()}
          >
            Повторить загрузку
          </button>
        </p>
      ) : state.loaded ? (
        <GoalForm
          key={state.goal?.version ?? 0}
          initial={state.goal}
          onSaved={() => state.refresh()}
        />
      ) : (
        <p role="status">Загружаем цель…</p>
      )}
    </section>
  );
}
