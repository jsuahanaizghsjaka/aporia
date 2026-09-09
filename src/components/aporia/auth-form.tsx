"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Eye, EyeSlash } from "@phosphor-icons/react";
import { Rune } from "./identity";
export function AuthForm({
  signup = false,
  configured,
  confirmationError = false,
}: {
  signup?: boolean;
  configured: boolean;
  confirmationError?: boolean;
}) {
  const [error, setError] = useState(
    confirmationError
      ? "Ссылка подтверждения недействительна или устарела. Попробуй войти или запросить регистрацию снова."
      : "",
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.next) window.location.assign(result.next);
      else setMessage(result.message);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось связаться с сервером. Попробуй снова.",
      );
    } finally {
      setPending(false);
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
        <form onSubmit={submit}>
          <label className="form-field">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
              disabled={!configured}
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
                disabled={!configured}
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
