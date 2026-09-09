"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowRight,
  Check,
  User,
  Target,
  Clock,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { useProfile } from "./profile-provider";
import { MentorVisual } from "./mentor-visual";
import type { ProfileView } from "@/lib/profile/schema";
import { newRequestId } from "@/lib/request-id";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  request_id?: string;
};
type OnboardingState = "introduction" | "conversation" | "review" | "complete";
const welcome =
  "Привет, я Aporia. Помогу тебе разобраться в Python и дойти до своего backend-проекта.\n\nЧто тебе хотелось бы уметь делать и зачем тебе это сейчас?";

function ProfileReview({
  initial,
  onBack,
}: {
  initial: ProfileView;
  onBack: () => void;
}) {
  const { saveProfile, href, preview } = useProfile();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveProfile({ ...draft, onboardingComplete: true });
      setComplete(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить профиль.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (complete)
    return (
      <section className="glass-panel empty-panel">
        <Check size={35} className="empty-icon" />
        <h2>Теперь у нас есть отправная точка.</h2>
        <p>
          {preview
            ? "Профиль сохранён в этом браузере. Его можно изменить в любой момент."
            : "Профиль сохранён. При следующем входе Aporia вспомнит твою цель, опыт и предпочтения."}
        </p>
        <Link className="primary-button" href={href("/dashboard")}>
          В моё пространство
          <ArrowRight size={17} />
        </Link>
      </section>
    );
  return (
    <form className="glass-panel review-form" onSubmit={confirm}>
      <h2 className="panel-heading">Всё верно?</h2>
      <p className="panel-description">
        Проверь и поправь профиль. Aporia запомнит только то, что ты
        подтвердишь.
      </p>
      <div className="form-grid">
        <label className="form-field">
          Как тебя называть
          <input
            required
            maxLength={60}
            value={draft.displayName}
            onChange={(event) =>
              setDraft({ ...draft, displayName: event.target.value })
            }
          />
        </label>
        <label className="form-field">
          Минут в день
          <input
            type="number"
            min={10}
            max={120}
            step={1}
            required
            value={draft.dailyMinutes}
            onChange={(event) =>
              setDraft({ ...draft, dailyMinutes: Number(event.target.value) })
            }
          />
        </label>
        {(
          [
            { key: "goal", label: "Твоя цель", limit: 500 },
            { key: "experience", label: "Что уже знаешь", limit: 1000 },
            { key: "context", label: "Твой контекст", limit: 1000 },
            { key: "interests", label: "Интересы", limit: 500 },
            {
              key: "preferences",
              label: "Как тебе удобнее учиться",
              limit: 500,
            },
          ] as const
        ).map((field) => (
          <label key={field.key} className="form-field full-width">
            {field.label}
            <textarea
              required={field.key === "goal"}
              maxLength={field.limit}
              value={draft[field.key]}
              onChange={(event) =>
                setDraft({ ...draft, [field.key]: event.target.value })
              }
            />
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button className="primary-button" disabled={busy}>
          {busy ? "Сохраняем…" : "Всё верно, сохранить"}
          <Check size={17} />
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={onBack}
        >
          Вернуться к разговору
        </button>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

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
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<{
    content: string;
    requestId: string;
  } | null>(null);
  const [extracting, setExtracting] = useState(false);
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
        : "Что сегодня хочешь понять в Python? Расскажи, что уже попробовал: начнём с твоей идеи и найдём следующий шаг.";
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch(`/api/mentor?conversation=${conversation}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setMessages(result.messages);
        setConfigured(result.configured);
        const last = result.messages.at(-1);
        if (last?.role === "user")
          setFailed({ content: last.content, requestId: last.request_id });
      })
      .catch((cause) => {
        if (cause.name !== "AbortError") setError(cause.message);
      })
      .finally(() => setLoading(false));
    return () => {
      controller.abort();
      abort.current?.abort();
    };
  }, [conversation, preview]);
  useEffect(() => {
    if (nearBottom.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages]);
  async function send(retry?: { content: string; requestId: string }) {
    const content = retry?.content ?? text.trim();
    if (!content || busy || preview) return;
    const requestId = retry?.requestId ?? newRequestId();
    const assistantId = `answer-${requestId}`;
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
      setMessages((current) =>
        current.filter((message) => message.id !== assistantId),
      );
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, conversation, requestId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error);
      }
      if (!response.body) throw new Error("Ответ не получен. Попробуй снова.");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        answer = "",
        complete = false;
      try {
        for (;;) {
          const chunk = await reader.read();
          buffer += chunk.done
            ? decoder.decode()
            : decoder.decode(chunk.value, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.type === "error") throw new Error(event.error);
            if (event.type === "done") complete = true;
            if (event.type === "delta") {
              answer += event.text;
              const content = answer;
              setMessages((current) => [
                ...current.filter((message) => message.id !== assistantId),
                { id: assistantId, role: "assistant", content },
              ]);
            }
          }
          if (chunk.done) break;
        }
        if (!complete)
          throw new Error(
            "Ответ прервался. Попробуй отправить сообщение ещё раз.",
          );
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error ? cause.message : "Не удалось получить ответ.",
        );
        setFailed({ content, requestId });
      }
    } finally {
      setBusy(false);
      composer.current?.focus();
    }
  }
  async function extract() {
    if (!onReview) return;
    if (preview) {
      onReview(profile);
      return;
    }
    setExtracting(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/extract", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onReview({ ...profile, ...result.candidate });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось подготовить профиль.",
      );
    } finally {
      setExtracting(false);
    }
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
            <span>{busy ? "Думаю над ответом…" : "Python backend"}</span>
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
            <div className="chat-message assistant">
              <span className="message-label">APORIA</span>
              {intro}
            </div>
            {messages.map((message) => (
              <div key={message.id} className={`chat-message ${message.role}`}>
                <span className="message-label">
                  {message.role === "user" ? "ТЫ" : "APORIA"}
                </span>
                {message.content}
              </div>
            ))}
            {loading && (
              <p className="panel-description" role="status">
                Вспоминаю наш разговор…
              </p>
            )}
          </div>
          {(preview || (!loading && !configured)) && (
            <p className="notice mx-4 !mb-3">
              {preview
                ? "Это предпросмотр диалога. Для разговора с AI нужен аккаунт."
                : "Ментор временно недоступен. Твой профиль и история сохранены."}
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
          {error && (
            <div className="px-5 pb-4">
              <p className="error-message" role="alert">
                {error}
              </p>
              {failed && (
                <button
                  type="button"
                  className="text-link mt-2"
                  disabled={busy}
                  onClick={() => send(failed)}
                >
                  <ArrowCounterClockwise size={15} />
                  Повторить отправку
                </button>
              )}
            </div>
          )}
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <label className="sr-only" htmlFor={`message-${conversation}`}>
              Сообщение ментору
            </label>
            <textarea
              ref={composer}
              id={`message-${conversation}`}
              maxLength={4000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                preview
                  ? "Диалог будет доступен после входа"
                  : "Твой вопрос или мысль…"
              }
              disabled={preview || !configured || loading || busy || !!failed}
              rows={2}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button
              className="primary-button"
              aria-label="Отправить сообщение"
              disabled={
                !text.trim() || busy || preview || !configured || !!failed
              }
            >
              <ArrowUp size={20} />
            </button>
          </form>
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
              disabled={busy || extracting || loading}
            >
              {extracting
                ? "Собираем профиль…"
                : preview
                  ? "Заполнить профиль"
                  : "Проверить профиль"}
              <ArrowRight size={14} />
            </button>
          )}
        </aside>
      </div>
      {onReview && (
        <div className="form-actions mt-5">
          <button
            type="button"
            className="secondary-button"
            onClick={extract}
            disabled={busy || extracting || loading}
          >
            {extracting
              ? "Собираем профиль…"
              : preview
                ? "Заполнить профиль"
                : "Проверить профиль"}
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

export function MentorChat({ onboarding = false }: { onboarding?: boolean }) {
  const { profile } = useProfile();
  const [mode, setMode] = useState<"learn" | "help">("learn");
  const [state, setState] = useState<OnboardingState>(
    profile.onboardingComplete ? "complete" : "introduction",
  );
  const [candidate, setCandidate] = useState(profile);
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {onboarding ? "УРОК 0 · ЗНАКОМСТВО" : "УЧИТЬСЯ ЧЕРЕЗ ПРАКТИКУ"}
          </p>
          <h1>
            {onboarding
              ? "Давай найдём твоё направление."
              : "Не спеши. Разберёмся."}
          </h1>
          <p>
            {onboarding
              ? "Здесь можно начать с любой мысли о своей цели."
              : mode === "learn"
                ? "Вопросы и подсказки, чтобы прийти к решению самому."
                : "Прямые объяснения и помощь с конкретной задачей."}
          </p>
        </div>
      </div>
      {!onboarding && (
        <div className="mode-switch" role="group" aria-label="Режим обучения">
          <button
            aria-pressed={mode === "learn"}
            onClick={() => setMode("learn")}
          >
            Learn · Разобраться
          </button>
          <button
            aria-pressed={mode === "help"}
            onClick={() => setMode("help")}
          >
            Help · Получить помощь
          </button>
        </div>
      )}
      {onboarding && state === "review" ? (
        <ProfileReview
          initial={candidate}
          onBack={() => setState("conversation")}
        />
      ) : (
        <Conversation
          key={onboarding ? "onboarding" : mode}
          conversation={onboarding ? "onboarding" : mode}
          onReview={
            onboarding
              ? (next) => {
                  setCandidate(next);
                  setState("review");
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
