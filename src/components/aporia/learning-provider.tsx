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
import { uiError } from "@/lib/ui-error";
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
  askProject: (skill: SkillId, message: string) => Promise<boolean>;
  cancelProject: () => void;
  cancel: () => void;
  retry: () => Promise<unknown>;
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
  const projectController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const retryAction = useRef<
    | { kind: "send"; action: LearningAction }
    | { kind: "review"; skill: SkillId }
    | { kind: "project"; skill: SkillId; message: string }
    | null
  >(null);
  const projectPending = useRef<{ signature: string; id: string } | null>(null);
  useEffect(
    () => () => {
      projectController.current?.abort();
      actionController.current?.abort();
    },
    [],
  );
  const snapshot = useRef<string | null>(null);
  const { onboardingComplete, dailyMinutes, interests, goal, schedule } =
    profile;
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
              profile: {
                onboardingComplete,
                dailyMinutes,
                interests,
                goal,
                schedule,
              },
              requestId: newRequestId(),
            }),
          }
        : { cache: "no-store", signal: AbortSignal.timeout(20000) },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return { data: data as View, raw };
  }, [preview, onboardingComplete, dailyMinutes, interests, goal, schedule]);
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
        uiError(
          error,
          "Не удалось загрузить занятия. Проверь соединение и повтори.",
        ),
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
            uiError(
              cause,
              "Не удалось загрузить занятия. Проверь соединение и повтори.",
            ),
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
    const controller = new AbortController();
    actionController.current = controller;
    retryAction.current = { kind: "send", action };
    const perform = async () => {
      const raw = snapshot.current;
      const response = await fetch(
        preview ? "/api/learning/preview" : "/api/learning",
        {
          method: "POST",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(
              [
                "start_lesson",
                "recommend_resources",
                "generate_weekly_review",
              ].includes(action.type)
                ? 85000
                : 20000,
            ),
          ]),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            preview
              ? {
                  state: raw ? JSON.parse(raw) : view.state,
                  action,
                  requestId,
                  roadmap: JSON.parse(
                    localStorage.getItem("aporia:preview:roadmap:v1") ?? "null",
                  ),
                  profile: {
                    onboardingComplete,
                    dailyMinutes,
                    schedule,
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
      retryAction.current = null;
      return true;
    };
    try {
      return preview && navigator.locks
        ? await navigator.locks.request(KEY, commit)
        : await commit();
    } catch (error) {
      if (error instanceof PreviewConflict) pending.current = null;
      setError(
        controller.signal.aborted
          ? "Ожидание отменено. Сервер мог сохранить результат: обнови данные или повтори действие без двойного зачёта."
          : uiError(error),
      );
      return false;
    } finally {
      inFlight.current = false;
      actionController.current = null;
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
    const controller = new AbortController();
    actionController.current = controller;
    retryAction.current = { kind: "review", skill };
    try {
      const response = await fetch("/api/learning/project-review", {
        method: "POST",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(85000),
        ]),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      order.current.next();
      setView(data);
      retryAction.current = null;
      return true;
    } catch (error) {
      setError(
        controller.signal.aborted
          ? "Ожидание отменено. Обнови данные перед повторным разбором."
          : uiError(error, "Разбор временно недоступен. Попробуй снова."),
      );
      return false;
    } finally {
      inFlight.current = false;
      actionController.current = null;
      setBusy(false);
    }
  };
  const askProject = async (skill: SkillId, message: string) => {
    if (inFlight.current || !ready) return false;
    if (preview) {
      setError(
        "Проектный AI-чат доступен после входа и подключения AI. В preview можно сохранить решения вручную.",
      );
      return false;
    }
    inFlight.current = true;
    order.current.next();
    setBusy(true);
    setError("");
    const controller = new AbortController();
    projectController.current = controller;
    retryAction.current = { kind: "project", skill, message };
    const signature = JSON.stringify({ skill, message });
    if (projectPending.current?.signature !== signature)
      projectPending.current = { signature, id: newRequestId() };
    try {
      const response = await fetch("/api/learning/project-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(85000),
        ]),
        body: JSON.stringify({
          skill,
          message,
          version: view.version,
          requestId: projectPending.current.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.state) setView(data);
        if (response.status < 500) projectPending.current = null;
        throw new Error(data.error || "Ответ не завершён.");
      }
      setView(data);
      projectPending.current = null;
      retryAction.current = null;
      return true;
    } catch (cause) {
      setError(
        controller.signal.aborted
          ? "Запрос отменён. Если сервер уже успел сохранить ответ, он появится после обновления данных."
          : uiError(cause, "Связь прервалась. Можно повторить вопрос."),
      );
      return false;
    } finally {
      inFlight.current = false;
      projectController.current = null;
      setBusy(false);
    }
  };
  return (
    <LearningContext.Provider
      value={{
        view,
        loading,
        ready,
        busy,
        error,
        send,
        refresh,
        review,
        askProject,
        cancelProject: () => projectController.current?.abort(),
        cancel: () => {
          actionController.current?.abort();
          projectController.current?.abort();
        },
        retry: () => {
          const action = retryAction.current;
          if (!action) return refresh();
          if (action.kind === "send") return send(action.action);
          if (action.kind === "review") return review(action.skill);
          return askProject(action.skill, action.message);
        },
      }}
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
  const { loading, ready, error, busy, refresh, cancel, retry } = useLearning();
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
        {busy && (
          <div className="learning-error" role="status">
            <p>Обрабатываем действие…</p>
            <button className="text-link" onClick={cancel}>
              Отменить ожидание
            </button>
          </div>
        )}
        {error && (
          <div className="learning-error" role="alert">
            <p>{error}</p>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void retry()}
            >
              Повторить попытку
            </button>
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
