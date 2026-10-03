"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  User,
  Target,
  Clock,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { useProfile } from "./profile-provider";
import { MentorVisual } from "./mentor-visual";
import type { ProfileView } from "@/lib/profile/schema";
import { newRequestId } from "@/lib/request-id";
import { LessonZero } from "./lesson-zero";
import { readChatResponse, ChatFailure } from "@/lib/ai/chat-stream";
import {
  reviewSnapshotSchema,
  type OnboardingReview,
} from "@/lib/onboarding/ai-state";
import { profileTextFields } from "@/lib/onboarding/lesson-zero";
import {
  AIMessage,
  Message as ChatMessage,
  ChatInput,
  Typing,
} from "./chat-parts";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  request_id?: string;
  incomplete?: boolean;
};
const welcome =
  "Привет, я Aporia. Начнём с твоей цели, без готового направления за тебя.\n\nКак к тебе обращаться?";

function Conversation({
  conversation,
  onReview,
}: {
  conversation: "onboarding" | "learn" | "help";
  onReview?: (candidate: ProfileView) => void;
}) {
  const { profile, preview } = useProfile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!preview);
  const [configured, setConfigured] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [retryUntil, setRetryUntil] = useState(0),
    [retryWait, setRetryWait] = useState(0);
  const [onboardingReview, setOnboardingReview] =
    useState<OnboardingReview | null>(null);
  const inFlight = useRef(false),
    mounted = useRef(false);
  const [failed, setFailed] = useState<{
    content: string;
    requestId: string;
    retryable?: boolean;
  } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const intro =
    conversation === "onboarding"
      ? profile.onboardingComplete
        ? `С возвращением, ${profile.displayName}. Твоя цель — ${profile.goal}.\n\nЧто изменилось с прошлого раза? Можем уточнить профиль или обсудить следующий шаг.`
        : welcome
      : conversation === "help"
        ? "С чем нужна помощь? Расскажи о задаче и приложи код или текст ошибки — разберём по существу."
        : "Что хочешь разобрать в доступном треке Python backend? Расскажи, что уже пробовал, и найдём следующий шаг.";
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch(`/api/mentor?conversation=${conversation}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error("History unavailable");
        if (controller.signal.aborted) return;
        setMessages(result.messages);
        setConfigured(result.configured);
        setHistoryUnavailable(false);
        const snapshot = reviewSnapshotSchema.safeParse(result.onboarding);
        setOnboardingReview(snapshot.success ? snapshot.data : null);
        const last = result.messages.at(-1);
        if (last?.role === "user") {
          setFailed({ content: last.content, requestId: last.request_id });
          setError(
            "Последнее сообщение осталось без ответа. Можно повторить отправку.",
          );
        } else setFailed(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setConfigured(false);
          setHistoryUnavailable(true);
          setError("");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      abort.current?.abort();
    };
  }, [conversation, preview, loadAttempt]);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(
      () =>
        setRetryWait(Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000))),
      250,
    );
    return () => clearInterval(timer);
  }, [retryUntil]);
  function reloadConnection() {
    setError("");
    setLoading(true);
    setLoadAttempt((v) => v + 1);
  }
  useEffect(() => {
    if (nearBottom.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages]);
  async function send(retry?: { content: string; requestId: string }) {
    const content = retry?.content ?? text.trim();
    if (
      !content ||
      inFlight.current ||
      preview ||
      (retry && (retryWait > 0 || failed?.retryable === false))
    )
      return;
    inFlight.current = true;
    const requestId = retry?.requestId ?? newRequestId(),
      assistantId = `answer-${requestId}`;
    setBusy(true);
    setError("");
    setFailed(null);
    nearBottom.current = true;
    if (!retry) {
      setMessages((current) => [
        ...current,
        { id: requestId, role: "user", content },
      ]);
      setText("");
    } else
      setMessages((current) => current.filter((m) => m.id !== assistantId));
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, conversation, requestId }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(95000),
        ]),
      });
      await readChatResponse(
        response,
        (content) => {
          if (mounted.current)
            setMessages((current) => [
              ...current.filter((m) => m.id !== assistantId),
              { id: assistantId, role: "assistant", content },
            ]);
        },
        (snapshot) => {
          const parsed = reviewSnapshotSchema.safeParse(snapshot);
          if (!parsed.success)
            throw new ChatFailure(
              "Не удалось проверить итог знакомства. Повтори отправку.",
            );
          if (!mounted.current) return;
          setOnboardingReview(parsed.data);
          if (parsed.data.ready)
            onReview?.({ ...profile, ...parsed.data.candidate });
        },
      );
    } catch (cause) {
      if (mounted.current) {
        const failure =
          cause instanceof ChatFailure
            ? cause
            : new ChatFailure(
                controller.signal.aborted
                  ? "Ответ остановлен. Можно повторить отправку."
                  : cause instanceof Error && cause.name === "TimeoutError"
                    ? "Ментор не успел ответить. Повтори отправку."
                    : "Соединение прервалось. Проверь сеть и повтори отправку.",
              );
        setError(failure.message);
        setFailed({ content, requestId, retryable: failure.retryable });
        setRetryWait(failure.retryAfter);
        setRetryUntil(Date.now() + failure.retryAfter * 1000);
        setMessages((current) =>
          current.map((m) =>
            m.id === assistantId ? { ...m, incomplete: true } : m,
          ),
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        if (
          composer.current?.offsetParent &&
          window.matchMedia("(pointer: fine)").matches
        )
          composer.current.focus();
      }
    }
  }
  function extract() {
    onReview?.(
      onboardingReview
        ? { ...profile, ...onboardingReview.candidate }
        : profile,
    );
  }
  return (
    <>
      <div className="chat-layout">
        <section className="glass-panel chat-panel">
          <div className="chat-header">
            <strong>
              Aporia{" "}
              <span>
                {" "}
                /{" "}
                {conversation === "onboarding"
                  ? "знакомство"
                  : conversation === "learn"
                    ? "учимся вместе"
                    : "помощь с задачей"}
              </span>
            </strong>
            <span>
              {busy
                ? "Думаю над ответом…"
                : conversation === "onboarding"
                  ? "Направление выбираешь ты"
                  : "Практика: Python backend"}
            </span>
          </div>
          <div
            className="chat-messages"
            ref={scroller}
            onScroll={() => {
              const node = scroller.current;
              if (node)
                nearBottom.current =
                  node.scrollHeight - node.scrollTop - node.clientHeight < 80;
            }}
            role="log"
            aria-label="Разговор с ментором"
            aria-busy={busy || loading}
          >
            <AIMessage>{intro}</AIMessage>
            {messages.map((message) => (
              <ChatMessage key={message.id} role={message.role}>
                {message.content}
                {message.incomplete && (
                  <small className="incomplete-answer">
                    Незавершённый ответ · не подтверждён в истории
                  </small>
                )}
              </ChatMessage>
            ))}
            {busy && <Typing />}
            {loading && (
              <p className="panel-description" role="status">
                Вспоминаю наш разговор…
              </p>
            )}
          </div>
          {(preview || (!loading && !configured)) && (
            <p
              className="notice mx-4 !mb-3"
              role={historyUnavailable ? "alert" : undefined}
            >
              {preview
                ? "Это предпросмотр диалога. Для разговора с AI нужен аккаунт."
                : historyUnavailable
                  ? "Не удалось загрузить историю разговора. Это не означает, что AI отключён. Проверь подключение ещё раз или продолжи без AI."
                  : "AI сейчас не настроен. Можно заполнить профиль без него."}
              {onReview && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => onReview(profile)}
                  >
                    Заполнить профиль самостоятельно
                  </button>
                </>
              )}
            </p>
          )}
          {!preview &&
            !loading &&
            (!configured || failed?.retryable === false) && (
              <button
                type="button"
                className="text-link mx-5 mb-3"
                onClick={reloadConnection}
              >
                {historyUnavailable
                  ? "Повторить загрузку истории"
                  : "Проверить подключение снова"}
              </button>
            )}
          {error && (
            <div className="px-5 pb-4">
              <p className="error-message" role="alert">
                {error}
              </p>
              {failed && failed.retryable !== false && (
                <button
                  type="button"
                  className="text-link mt-2"
                  disabled={busy || retryWait > 0}
                  onClick={() => send(failed)}
                >
                  <ArrowCounterClockwise size={15} aria-hidden="true" />
                  {retryWait > 0
                    ? `Повторить через ${retryWait} с`
                    : "Повторить отправку"}
                </button>
              )}
            </div>
          )}
          {busy && (
            <button
              type="button"
              className="text-link mx-5 mb-3"
              onClick={() => abort.current?.abort()}
            >
              Остановить ответ
            </button>
          )}
          <ChatInput
            id={`message-${conversation}`}
            inputRef={composer}
            value={text}
            onChange={setText}
            onSend={() => {
              void send();
            }}
            disabled={preview || !configured || loading || busy || !!failed}
            placeholder={
              preview
                ? "Диалог будет доступен после входа"
                : "Твой вопрос или мысль…"
            }
          />
        </section>
        <aside className="glass-panel chat-side">
          <MentorVisual compact />
          <h2>
            {conversation === "onboarding"
              ? "Сначала — о тебе."
              : "Понимание важнее скорости."}
          </h2>
          <p>
            {conversation === "onboarding"
              ? "Немного контекста поможет выбрать подходящий темп и примеры."
              : "Можно ошибаться, просить подсказки и возвращаться к непонятному."}
          </p>
          <ul>
            <li>
              <Target size={15} />
              Одна понятная цель
            </li>
            <li>
              <Clock size={15} />
              Комфортный ритм
            </li>
            <li>
              <User size={15} />
              Твои интересы и опыт
            </li>
          </ul>
          {onReview && (
            <button
              type="button"
              className="secondary-button"
              onClick={extract}
              disabled={busy || loading || !!failed}
            >
              {preview ? "Заполнить профиль" : "Проверить профиль"}
              <ArrowRight size={14} />
            </button>
          )}
          {onReview && onboardingReview && !busy && (
            <p className="lesson-note" role="status">
              {onboardingReview.ready
                ? "Итог готов к твоей проверке. Пока ничего не подтверждено."
                : onboardingReview.missing.length
                  ? `Ещё обсудим: ${onboardingReview.missing.map((key) => profileTextFields.find((f) => f.key === key)?.label ?? "Размер занятия").join(", ")}. Личные темы можно пропустить.`
                  : "Темы обсудили. Попроси ментора подвести итог или открой профиль для проверки."}
            </p>
          )}
        </aside>
      </div>
      {onReview && (
        <div className="form-actions mt-5">
          <button
            type="button"
            className="secondary-button"
            onClick={extract}
            disabled={busy || loading || !!failed}
          >
            {preview ? "Заполнить профиль" : "Проверить профиль"}
            <ArrowRight size={15} />
          </button>
          {!preview && (
            <button
              type="button"
              className="text-link"
              onClick={() => onReview(profile)}
              disabled={busy}
            >
              Заполнить самостоятельно
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function MentorChat({
  onboarding = false,
  aiAvailable = false,
}: {
  onboarding?: boolean;
  aiAvailable?: boolean;
}) {
  const [mode, setMode] = useState<"learn" | "help">("learn");
  if (onboarding)
    return (
      <LessonZero
        renderAI={
          aiAvailable
            ? (onReview) => (
                <Conversation conversation="onboarding" onReview={onReview} />
              )
            : undefined
        }
      />
    );
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">УЧИТЬСЯ ЧЕРЕЗ ПРАКТИКУ</p>
          <h1>Не спеши. Разберёмся.</h1>
          <p>
            {mode === "learn"
              ? "Вопросы и подсказки, чтобы прийти к решению самому."
              : "Прямые объяснения и помощь с конкретной задачей."}
          </p>
        </div>
      </div>
      <div className="mode-switch" role="group" aria-label="Режим обучения">
        <button
          aria-pressed={mode === "learn"}
          onClick={() => setMode("learn")}
        >
          Learn · Разобраться
        </button>
        <button aria-pressed={mode === "help"} onClick={() => setMode("help")}>
          Help · Получить помощь
        </button>
      </div>
      <Conversation key={mode} conversation={mode} />
    </div>
  );
}
