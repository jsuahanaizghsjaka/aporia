"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useProfile } from "./profile-provider";
import { initialLearningState } from "@/lib/learning/selectors";
import {
  commitPreview,
  createRequestOrder,
  PreviewConflict,
} from "@/lib/preview-storage";
import { newRequestId } from "@/lib/request-id";
import type {
  LearningAction,
  LearningView,
  SkillId,
} from "@/lib/learning/types";
const KEY = "aporia:preview:learning:v1";
type View = LearningView & { version: number };
const emptyView = (): View => ({
  state: initialLearningState(),
  question: null,
  help: null,
  solution: null,
  projectQuestions: [],
  projectFeedback: {},
  version: 0,
});
const LearningContext = createContext<{
  view: View;
  loading: boolean;
  ready: boolean;
  busy: boolean;
  error: string;
  send: (action: LearningAction) => Promise<boolean>;
  refresh: () => Promise<void>;
  review: (skill: SkillId) => Promise<boolean>;
} | null>(null);
export function LearningProvider({ children }: { children: React.ReactNode }) {
  const { profile, preview } = useProfile();
  const [view, setView] = useState<View>(emptyView),
    [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false),
    pending = useRef<{ signature: string; id: string } | null>(null);
  const order = useRef(createRequestOrder());
  const snapshot = useRef<string | null>(null);
  const { onboardingComplete, dailyMinutes, interests, goal } = profile;
  const loadView = useCallback(async () => {
    const raw = preview ? localStorage.getItem(KEY) : null;
    const response = await fetch(
      preview ? "/api/learning/preview" : "/api/learning",
      preview
        ? {
            method: "POST",
            signal: AbortSignal.timeout(20000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              state: raw ? JSON.parse(raw) : undefined,
              profile: { onboardingComplete, dailyMinutes, interests, goal },
              requestId: newRequestId(),
            }),
          }
        : { cache: "no-store", signal: AbortSignal.timeout(20000) },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return { data: data as View, raw };
  }, [preview, onboardingComplete, dailyMinutes, interests, goal]);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const ticket = order.current.next();
    try {
      const { data, raw } = await loadView();
      if (!order.current.isCurrent(ticket)) return;
      snapshot.current = raw;
      setView(data);
      setReady(true);
      setError("");
    } catch (error) {
      if (!order.current.isCurrent(ticket)) return;
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить занятия.",
      );
    } finally {
      if (order.current.isCurrent(ticket)) setLoading(false);
    }
  }, [loadView]);
  useEffect(() => {
    const currentOrder = order.current;
    const ticket = currentOrder.next();
    loadView()
      .then(({ data, raw }) => {
        if (!currentOrder.isCurrent(ticket)) return;
        snapshot.current = raw;
        setView(data);
        setReady(true);
        setError("");
      })
      .catch((cause) => {
        if (currentOrder.isCurrent(ticket))
          setError(
            cause instanceof Error
              ? cause.message
              : "Не удалось загрузить занятия.",
          );
      })
      .finally(() => {
        if (currentOrder.isCurrent(ticket)) setLoading(false);
      });
    return () => {
      currentOrder.next();
    };
  }, [loadView]);
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (preview && event.key === KEY) void refresh();
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [preview, refresh]);
  useEffect(() => {
    const onReturn = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("online", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh]);
  const send = async (action: LearningAction) => {
    if (inFlight.current || !ready) return false;
    inFlight.current = true;
    order.current.next();
    setBusy(true);
    setError("");
    const signature = JSON.stringify(action);
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: newRequestId() };
    const requestId = pending.current.id;
    const perform = async () => {
      const raw = snapshot.current;
      const response = await fetch(
        preview ? "/api/learning/preview" : "/api/learning",
        {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            preview
              ? {
                  state: raw ? JSON.parse(raw) : view.state,
                  action,
                  requestId,
                  profile: {
                    onboardingComplete,
                    dailyMinutes,
                    interests,
                    goal,
                  },
                }
              : { version: view.version, action, requestId },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.state) {
          order.current.next();
          setView(data);
        }
        if (response.status < 500) pending.current = null;
        throw new Error(data.error || "Не удалось сохранить ответ.");
      }
      return { value: JSON.stringify(data.state), result: data as View };
    };
    const commit = async () => {
      const data = preview
        ? await commitPreview(localStorage, KEY, snapshot.current, perform)
        : (await perform()).result;
      if (preview) snapshot.current = JSON.stringify(data.state);
      order.current.next();
      setView(data);
      pending.current = null;
      return true;
    };
    try {
      return preview && navigator.locks
        ? await navigator.locks.request(KEY, commit)
        : await commit();
    } catch (error) {
      if (error instanceof PreviewConflict) pending.current = null;
      setError(
        error instanceof Error
          ? error.message
          : "Связь прервалась. Повтори действие — ответ не будет засчитан дважды.",
      );
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const review = async (skill: SkillId) => {
    if (inFlight.current) return false;
    if (preview) {
      setError(
        "Разбор AI доступен в аккаунте после подключения ментора. Локальный черновик сохранён.",
      );
      return false;
    }
    inFlight.current = true;
    order.current.next();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/learning/project-review", {
        method: "POST",
        signal: AbortSignal.timeout(90000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      order.current.next();
      setView(data);
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Разбор временно недоступен.",
      );
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <LearningContext.Provider
      value={{ view, loading, ready, busy, error, send, refresh, review }}
    >
      {children}
    </LearningContext.Provider>
  );
}
export function useLearning() {
  const context = useContext(LearningContext);
  if (!context) throw new Error("LearningProvider missing");
  return context;
}
export function LearningGate({ children }: { children: React.ReactNode }) {
  const { loading, ready, error, busy, refresh } = useLearning();
  const { preview } = useProfile();
  return (
    <>
      {preview && (
        <p className="preview-notice">
          Локальная практика · ответы и черновики сохраняются только в этом
          браузере. Они не переносятся в аккаунт автоматически.
        </p>
      )}
      <div aria-live="polite">
        {error && (
          <div className="learning-error" role="alert">
            <p>{error}</p>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Обновить данные
            </button>
          </div>
        )}
      </div>
      {loading ? (
        <div className="glass-panel lesson-loading" role="status">
          Загружаем твоё занятие…
        </div>
      ) : ready ? (
        children
      ) : null}
    </>
  );
}
