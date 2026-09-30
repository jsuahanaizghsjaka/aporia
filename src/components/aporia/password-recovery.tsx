"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function PasswordRecovery({
  reset = false,
  configured,
  allowed = true,
}: {
  reset?: boolean;
  configured: boolean;
  allowed?: boolean;
}) {
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current || !configured || !allowed || cooldown) return;
    const form = new FormData(event.currentTarget);
    if (reset && form.get("password") !== form.get("confirmation")) {
      setError("Пароли не совпадают.");
      return;
    }
    const active = new AbortController();
    controller.current = active;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(20000)]),
        body: JSON.stringify(
          reset
            ? {
                action: "update",
                password: form.get("password"),
                confirmation: form.get("confirmation"),
              }
            : { action: "request", email: form.get("email") },
        ),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Не удалось выполнить запрос. Попробуй позже.");
        return;
      }
      setMessage(data.message);
      setDone(reset);
      if (!reset) {
        setCooldown(true);
        timer.current = setTimeout(() => setCooldown(false), 60000);
      }
    } catch {
      setError(
        active.signal.aborted
          ? reset
            ? "Ожидание отменено. Пароль мог измениться: попробуй войти с новым паролем."
            : "Ожидание отменено. Письмо могло отправиться: проверь почту перед повторной попыткой."
          : reset
            ? "Ответ не получен. Проверь соединение. Если пароль уже изменился, попробуй войти с новым."
            : "Ответ не получен. Проверь соединение и почту перед повторной попыткой.",
      );
    } finally {
      controller.current = null;
      setPending(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-card glass-panel">
        <Link className="brand" href="/">
          aporia.
        </Link>
        <h1>{reset ? "Новый пароль." : "Вернём доступ."}</h1>
        <p>
          {reset
            ? "Придумай пароль от 8 до 128 символов. Не используй пароль от почты."
            : "Укажи почту своего аккаунта. Отправим ссылку для смены пароля."}
        </p>
        {!configured && (
          <p role="status">Сервис аккаунтов пока не подключён.</p>
        )}
        {!allowed && (
          <p role="alert" className="error-message">
            Ссылка устарела или открыта в другом браузере. Запроси новое письмо
            и открой его здесь.
          </p>
        )}
        {configured && allowed && !done && (
          <form onSubmit={submit} aria-busy={pending}>
            {reset ? (
              <>
                {["password", "confirmation"].map((name) => (
                  <label className="form-field" key={name}>
                    {name === "password" ? "Новый пароль" : "Повтори пароль"}
                    <input
                      name={name}
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      disabled={pending}
                    />
                  </label>
                ))}
              </>
            ) : (
              <label className="form-field">
                Email
                <input
                  name="email"
                  type="email"
                  spellCheck={false}
                  autoComplete="email"
                  required
                  maxLength={254}
                  disabled={pending}
                />
              </label>
            )}
            {error && (
              <p
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="error-message"
              >
                {error}
              </p>
            )}
            <button
              className="primary-button"
              disabled={!hydrated || pending || cooldown}
            >
              {pending
                ? "Подожди немного…"
                : cooldown
                  ? "Повторить можно через минуту"
                  : reset
                    ? "Сохранить новый пароль"
                    : "Отправить ссылку"}
            </button>
            {pending && (
              <button
                className="text-link"
                type="button"
                onClick={() => controller.current?.abort()}
              >
                Отменить ожидание
              </button>
            )}
          </form>
        )}
        {message && (
          <div className="mt-5">
            <p className="status-message" role="status">
              {message}
            </p>
            {!reset && (
              <p className="quiet-copy mt-4">
                Письма нет? Проверь точный адрес регистрации, включая часть
                после «+», если она была. Предпросмотр работает без аккаунта.
                Если ты только смотрел демо,{" "}
                <Link className="text-link" href="/signup">
                  создай аккаунт
                </Link>
                .
              </p>
            )}
          </div>
        )}
        {reset && !allowed && (
          <Link className="primary-button mt-5" href="/forgot-password">
            Запросить новое письмо
          </Link>
        )}
        <Link className="text-link mt-6" href="/login">
          Вернуться ко входу
        </Link>
      </section>
    </main>
  );
}
