"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-layout">
      <section className="glass-panel auth-card">
        <h1>Не удалось открыть страницу.</h1>
        <p>Попробуй ещё раз. Если ошибка повторяется, вернись на главную.</p>
        <div className="form-actions mt-6">
          <button className="primary-button" onClick={reset}>
            Попробовать снова
          </button>
          <Link className="secondary-button" href="/">
            На главную
          </Link>
        </div>
      </section>
    </main>
  );
}
