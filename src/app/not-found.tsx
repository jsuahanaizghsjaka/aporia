import Link from "next/link";
export default function NotFound() {
  return (
    <main className="auth-layout">
      <section className="glass-panel auth-card">
        <p className="eyebrow">404</p>
        <h1 className="mt-4">Этот путь пока никуда не ведёт.</h1>
        <p>Вернёмся в твоё пространство?</p>
        <Link className="primary-button mt-6" href="/">
          На главную
        </Link>
      </section>
    </main>
  );
}
