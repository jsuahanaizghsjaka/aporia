"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { safeNext } from "@/lib/auth/request";
import { ArrowRight, Eye, EyeSlash } from "@phosphor-icons/react";
import { Rune } from "./identity";
export function AuthForm({
  signup = false,
  configured,
  confirmationError = false,
  initialError = "",
  next = "/dashboard",
}: {
  signup?: boolean;
  configured: boolean;
  confirmationError?: boolean;
  initialError?: string;
  next?: string;
}) {
  const [error, setError] = useState(
    confirmationError
      ? "Ссылка подтверждения недействительна или устарела. Открой последнее письмо в браузере регистрации. Если почта уже подтверждена, войди с паролем."
      : initialError,
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !configured) return;
    submitting.current = true;
    setError("");
    setMessage("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: signup ? "signup" : "login",
          email: form.get("email"),
          password: form.get("password"),
          next: safeNext(next),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          typeof result?.error === "string"
            ? result.error
            : "Сервис временно недоступен. Попробуй снова.",
        );
        return;
      }
      if (typeof result?.next === "string")
        window.location.assign(safeNext(result.next));
      else if (typeof result?.message === "string") setMessage(result.message);
      else setError("Сервер вернул неполный ответ. Попробуй снова.");
    } catch {
      setError(
        "Не удалось связаться с сервером. Проверь соединение и попробуй снова.",
      );
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-card glass-panel">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Rune />
          </span>
          <span>
            aporia<span className="brand-period">.</span>
          </span>
        </Link>
        <h1>{signup ? "Начни свой маршрут." : "С возвращением."}</h1>
        <p>
          {signup
            ? "Один аккаунт для твоей цели, практики и памяти ментора."
            : "Твоя цель и разговоры с ментором ждут тебя."}
        </p>
        {!configured && (
          <div className="notice mt-5">
            Регистрация и вход скоро будут доступны. Пока можно{" "}
            <Link className="text-link" href="/preview">
              посмотреть интерфейс →
            </Link>
          </div>
        )}
        <form onSubmit={submit} aria-busy={pending}>
          <label className="form-field">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
              disabled={!configured || pending}
            />
          </label>
          <label className="form-field">
            Пароль
            <span className="relative block">
              <input
                className="!pr-12"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={8}
                maxLength={128}
                required
                placeholder="Не менее 8 символов"
                disabled={!configured || pending}
              />
              <button
                type="button"
                className="icon-button absolute right-1 top-1 !border-0"
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="status-message" role="status">
              {message}
            </p>
          )}
          <button disabled={pending || !configured} className="primary-button">
            {pending
              ? "Подожди немного…"
              : signup
                ? "Создать аккаунт"
                : "Войти"}
            <ArrowRight size={17} />
          </button>
        </form>
        <div className="auth-switch">
          {signup ? "Уже есть аккаунт?" : "Впервые здесь?"}
          <Link href={signup ? "/login" : "/signup"}>
            {signup ? "Войти" : "Начать знакомство"}
          </Link>
        </div>
        <Link className="text-link mt-6 w-full justify-center" href="/preview">
          Посмотреть Aporia
        </Link>
      </section>
    </main>
  );
}
