"use client";
import Link from "next/link";
import { ArrowUpRight, ArrowRight, Pause, Play } from "@phosphor-icons/react";
import { ProfileProvider, useProfile } from "./profile-provider";
import { Rune } from "./identity";
import { MentorVisual } from "./mentor-visual";
function LandingContent({ configured }: { configured: boolean }) {
  const { motion, setMotion } = useProfile();
  return (
    <div className={`landing ${motion ? "" : "motion-off"}`}>
      <a className="skip-link" href="#main-content">
        К содержимому
      </a>
      <div className="ambient-background" aria-hidden="true">
        <span />
        <span />
      </div>
      <header className="landing-nav">
        <Link className="brand" href="/" aria-label="Aporia: главная">
          <span className="brand-mark">
            <Rune />
          </span>
          aporia<span className="brand-dot">.</span>
        </Link>
        <div>
          <button
            className="icon-button"
            onClick={() => setMotion(!motion)}
            aria-label={motion ? "Остановить анимацию" : "Включить анимацию"}
          >
            {motion ? (
              <Pause size={18} aria-hidden="true" />
            ) : (
              <Play size={18} aria-hidden="true" />
            )}
          </button>
          <Link className="text-link" href="/login">
            Войти
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <main id="main-content">
        <section className="landing-hero">
          <div>
            <p className="eyebrow">ТВОЙ ПЕРСОНАЛЬНЫЙ МЕНТОР</p>
            <h1>
              Твой следующий шаг в <em>Python backend.</em>
            </h1>
            <p>
              Ментор, который помнит твою цель, подбирает практику и помогает
              собрать работающий проект в твоём темпе.
            </p>
            <div className="exercise-actions">
              <Link
                className="primary-button"
                href={configured ? "/signup" : "/preview"}
              >
                {configured ? "Начать обучение" : "Посмотреть демо"}
                <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              {configured && (
                <Link className="text-link" href="/preview">
                  Посмотреть демо
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
          <MentorVisual />
        </section>
        <section className="landing-problem" aria-labelledby="problem-title">
          <h2 id="problem-title">Материалов много. С чего продолжить?</h2>
          <p>
            Вкладки с курсами копятся, а связать темы в работающий проект всё
            ещё трудно. Aporia превращает твою цель в конкретную практику на
            сегодня.
          </p>
        </section>
        <section className="landing-method" aria-labelledby="method-title">
          <h2 id="method-title">От знакомства до своего проекта.</h2>
          <ol className="landing-journey">
            {[
              [
                "Знакомимся",
                "Расскажи о цели, опыте и свободном времени. Исправь и подтверди профиль, который ментор будет помнить.",
              ],
              [
                "Строим маршрут",
                "Короткая диагностика покажет стартовый уровень. Подтверди путь к своей цели и узнай, с чего начать сегодня.",
              ],
              [
                "Разбираемся",
                "Короткое объяснение, задача и подсказки по шагам. Если нужен прямой ответ, переключись в режим помощи.",
              ],
              [
                "Создаём",
                "Применяй знания в своём backend-проекте: от первого Python-кода до API, тестов и Docker.",
              ],
              [
                "Закрепляем",
                "Смотри, какие ответы подтверждают твой уровень. Возвращайся к трудным темам и корректируй маршрут по итогам недели.",
              ],
            ].map(([title, description]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="landing-invite glass-panel">
          <div>
            <h2>Начни со своей цели.</h2>
            <p>
              Первый трек: Python backend. Демо доступно без регистрации,
              аккаунт сохраняет твой профиль и занятия. Ответы AI могут
              ошибаться: проверяй код на практике.
            </p>
          </div>
          <Link
            className="primary-button"
            href={configured ? "/signup" : "/preview"}
          >
            {configured ? "Начать обучение" : "Посмотреть демо"}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <span>Aporia · учиться с пониманием</span>
        <Link href="/privacy">О твоих данных</Link>
        <Link href="/preview">Посмотреть демо</Link>
      </footer>
    </div>
  );
}
export function Landing({ configured }: { configured: boolean }) {
  return (
    <ProfileProvider preview>
      <LandingContent configured={configured} />
    </ProfileProvider>
  );
}
