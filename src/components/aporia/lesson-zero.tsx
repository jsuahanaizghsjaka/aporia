"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onboardingKeys } from "@/lib/onboarding/ai-state";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, PencilSimple } from "@phosphor-icons/react";
import {
  beginLesson,
  answerLesson,
  confirmedLessonProfile,
  questions,
  profileTextFields,
} from "@/lib/onboarding/lesson-zero";
import type { ProfileView } from "@/lib/profile/schema";
import { useProfile } from "./profile-provider";
import { MentorVisual } from "./mentor-visual";
import { AIMessage, ChatInput, UserMessage } from "./chat-parts";
import { ProfileFields } from "./profile-fields";

function ProfileReview({
  draft,
  onChange,
  onBack,
  onSaved,
}: {
  draft: ProfileView;
  onChange: (draft: ProfileView) => void;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { saveProfile, preview } = useProfile();
  const [editing, setEditing] = useState(
    !draft.displayName.trim() || !draft.goal.trim(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (
      !draft.displayName.trim() ||
      !draft.goal.trim() ||
      !Number.isInteger(draft.dailyMinutes) ||
      draft.dailyMinutes < 10 ||
      draft.dailyMinutes > 120
    ) {
      setEditing(true);
      setError(
        "Укажи имя, цель и продолжительность занятия от 10 до 120 минут.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await saveProfile(confirmedLessonProfile(draft));
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить профиль. Твои правки остались здесь.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="glass-panel review-form lesson-review"
      onSubmit={confirm}
      aria-busy={busy}
    >
      <div className="lesson-review-heading">
        <div>
          <p className="eyebrow">ТВОЯ ОТПРАВНАЯ ТОЧКА</p>
          <h2 tabIndex={-1}>Так начнём?</h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          <PencilSimple size={16} aria-hidden="true" />
          {editing ? "Посмотреть итог" : "Исправить профиль"}
        </button>
      </div>
      <p className="panel-description">
        Это черновик по разговору, а не оценка навыков. Проверь формулировки и
        поправь детали. Если размер занятия пропущен, предложено 25 минут — это
        значение тоже можно изменить.
      </p>
      {editing ? (
        <fieldset disabled={busy}>
          <legend className="sr-only">Редактирование итогового профиля</legend>
          <ProfileFields value={draft} onChange={onChange} required />
        </fieldset>
      ) : (
        <dl className="lesson-summary">
          {profileTextFields.map(({ key, label }) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{draft[key] || "Не указано"}</dd>
            </div>
          ))}
          <div>
            <dt>Минут на занятие в учебный день</dt>
            <dd>{draft.dailyMinutes} минут</dd>
          </div>
        </dl>
      )}
      <p className="lesson-note">
        {preview
          ? "После подтверждения профиль сохранится только в этом браузере."
          : "После подтверждения профиль сохранится в твоём аккаунте."}
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary-button" disabled={busy}>
          {busy ? "Сохраняем…" : "Всё верно, сохранить"}
          <Check size={17} aria-hidden="true" />
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={onBack}
        >
          Вернуться к разговору
        </button>
      </div>
    </form>
  );
}

export function LessonZero({
  renderAI,
}: {
  renderAI?: (onReview: (profile: ProfileView) => void) => ReactNode;
}) {
  const { profile, preview, href } = useProfile();
  const router = useRouter();
  const [stage, setStage] = useState<
    "intro" | "guided" | "ai" | "review" | "complete"
  >("intro");
  const [activeMode, setActiveMode] = useState<"guided" | "ai">("guided");
  const [baseline, setBaseline] = useState(profile);
  const [lesson, setLesson] = useState(() => beginLesson(profile));
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nearBottom = useRef(true);
  const [lastAIProposal, setLastAIProposal] = useState<ProfileView | null>(
    null,
  );
  // Preview hydration can supply a saved profile after the first render.
  // Once a conversation starts, preserve its version and draft on conflicts.
  if (profile !== baseline) {
    setBaseline(profile);
    if (stage === "intro") setLesson(beginLesson(profile));
  }
  useEffect(() => {
    if (nearBottom.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [lesson.messages]);
  useEffect(() => {
    if (stage === "guided" && window.matchMedia("(pointer: fine)").matches)
      composer.current?.focus();
    else if (stage === "review" || stage === "complete")
      heading.current?.focus();
  }, [stage]);
  useEffect(() => {
    if ((stage !== "guided" && stage !== "review") || lesson.index === 0)
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage, lesson.index]);
  const question = questions[lesson.index];
  function send(skip = false) {
    try {
      const next = answerLesson(lesson, text, skip);
      setLesson(next);
      setText("");
      setError("");
      nearBottom.current = true;
      if (!questions[next.index]) setStage("review");
      else composer.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Проверь ответ.");
    }
  }
  function openAIReview(candidate: ProfileView) {
    const changes = Object.fromEntries(
      onboardingKeys
        .filter((key) => lastAIProposal?.[key] !== candidate[key])
        .map((key) => [key, candidate[key]]),
    );
    setLastAIProposal(candidate);
    setLesson((current) => ({
      ...current,
      profile: { ...current.profile, ...changes },
    }));
    setStage("review");
  }
  function openReview(candidate = lesson.profile) {
    setLesson((current) => ({ ...current, profile: candidate }));
    setStage("review");
  }
  return (
    <div className="page-enter lesson-zero">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MEET YOUR MENTOR · УРОК 0</p>
          <h1 ref={heading} tabIndex={-1}>
            {stage === "review"
              ? "Вот что важно о тебе."
              : stage === "complete"
                ? "Знакомство состоялось."
                : "Сначала познакомимся."}
          </h1>
          <p>Твоя цель, твой ритм, твой способ учиться.</p>
        </div>
      </div>
      {stage === "intro" && (
        <section className="glass-panel lesson-intro">
          <div>
            <h2>Место, где можно начать с себя.</h2>
            <p>
              Мне не нужно знать о тебе всё. Немного контекста поможет выбрать
              подходящие примеры и размер занятия.
            </p>
            <p>
              Будем говорить по одной теме. Личные вопросы можно пропустить, а в
              конце — исправить и подтвердить профиль.
            </p>
            <div className="form-actions">
              <button
                className="primary-button"
                onClick={() => {
                  setActiveMode(renderAI ? "ai" : "guided");
                  setStage(renderAI ? "ai" : "guided");
                }}
              >
                Начать знакомство
                <ArrowRight size={17} aria-hidden="true" />
              </button>
              {renderAI && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setActiveMode("guided");
                    setStage("guided");
                  }}
                >
                  Ответить по шагам без AI
                </button>
              )}
              {profile.onboardingComplete && (
                <button
                  className="text-link"
                  onClick={() => openReview(profile)}
                >
                  Проверить сохранённый профиль
                </button>
              )}
            </div>
            <p className="lesson-note">
              Подготовленное знакомство работает без AI. Ответы переходят в
              профиль без автоматических догадок.
            </p>
            <p className="lesson-note">
              Направление выбираешь ты. Проверяемые задания и диагностика пока
              доступны только по Python backend; другую цель мы сохраним без
              подмены.
            </p>
          </div>
          <MentorVisual />
        </section>
      )}
      {stage === "guided" && (
        <div className="chat-layout lesson-chat-layout">
          <section className="glass-panel chat-panel">
            <div className="chat-header">
              <strong>
                Aporia <span>/ знакомство</span>
              </strong>
              <span>Подготовленный диалог · без AI</span>
            </div>
            <div
              className="chat-messages"
              ref={log}
              role="log"
              aria-label="Разговор-знакомство"
              onScroll={() => {
                const node = log.current;
                if (node)
                  nearBottom.current =
                    node.scrollHeight - node.scrollTop - node.clientHeight < 80;
              }}
            >
              {lesson.messages.map((message) =>
                message.role === "user" ? (
                  <UserMessage key={message.id}>{message.content}</UserMessage>
                ) : (
                  <AIMessage key={message.id}>{message.content}</AIMessage>
                ),
              )}
            </div>
            {error && (
              <p role="alert" className="error-message px-5 pb-4">
                {error}
              </p>
            )}
            {question?.key === "dailyMinutes" && (
              <div
                className="lesson-choices"
                role="group"
                aria-label="Продолжительность занятия"
              >
                {[15, 25, 45, 60].map((minutes) => (
                  <button
                    key={minutes}
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setText(String(minutes));
                      composer.current?.focus();
                    }}
                  >
                    {minutes} минут
                  </button>
                ))}
              </div>
            )}
            {question ? (
              <ChatInput
                id="lesson-zero-message"
                inputRef={composer}
                value={text}
                onChange={setText}
                onSend={() => send()}
                maxLength={question.limit}
                placeholder={question.placeholder}
              />
            ) : (
              <div className="form-actions p-5">
                <button className="primary-button" onClick={() => openReview()}>
                  Посмотреть итоговый профиль
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="lesson-chat-actions">
              {question?.optional && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => send(true)}
                >
                  Пропустить эту тему
                </button>
              )}
              <span>Enter — отправить · Shift+Enter — новая строка</span>
            </div>
          </section>
          <aside className="glass-panel chat-side">
            <p className="eyebrow">БЕЗ СПЕШКИ</p>
            <h2>
              {question
                ? profileTextFields.find((field) => field.key === question.key)
                    ?.label || "Размер занятия"
                : "Готово к проверке"}
            </h2>
            <p>
              {lesson.index} из {questions.length} тем пройдено. Это знакомство,
              не тест.
            </p>
            <progress
              className="lesson-progress"
              max={questions.length}
              value={lesson.index}
              aria-label="Пройденные темы знакомства"
            />
            <p>
              Короткого ответа своими словами достаточно. Личные темы можно
              пропустить.
            </p>
            <p>Черновик остаётся на этой странице до подтверждения профиля.</p>
            <button
              type="button"
              className="secondary-button mt-5"
              onClick={() => openReview()}
            >
              Перейти к итогу
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </aside>
        </div>
      )}
      {activeMode === "ai" &&
        renderAI &&
        stage !== "intro" &&
        stage !== "complete" && (
          <div hidden={stage !== "ai"}>
            <div className="form-actions mb-5">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setActiveMode("guided");
                  setStage("guided");
                }}
              >
                Продолжить знакомство без AI
              </button>
              <p className="lesson-note">
                Ответы по шагам начнутся сначала; разговор с AI останется в
                истории аккаунта.
              </p>
            </div>
            {renderAI(openAIReview)}
          </div>
        )}
      {stage === "review" && (
        <ProfileReview
          draft={lesson.profile}
          onChange={(value) =>
            setLesson((current) => ({ ...current, profile: value }))
          }
          onBack={() => setStage(activeMode)}
          onSaved={() => {
            setStage("complete");
            router.replace(href("/dashboard"));
            router.refresh();
          }}
        />
      )}
      {stage === "complete" && (
        <section className="glass-panel empty-panel">
          <Check size={35} className="empty-icon" aria-hidden="true" />
          <h2>Теперь у нас есть отправная точка.</h2>
          <p>
            {preview
              ? "Профиль сохранён в этом браузере. Это локальный предпросмотр, без аккаунта."
              : "Профиль сохранён в аккаунте. Его можно исправить в разделе «Профиль»."}
          </p>
          <Link className="primary-button" href={href("/dashboard")}>
            В моё пространство
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
}
