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
      <div className="ambient-background" aria-hidden="true">
        <span />
        <span />
      </div>
      <header className="landing-nav">
        <Link className="brand" href="/" aria-label="Aporia — главная">
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
            {motion ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <Link className="text-link" href="/login">
            Войти
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <main>
        <section className="landing-hero">
          <div>
            <p className="eyebrow">
              <span className="status-dot" /> ТВОЙ ПЕРСОНАЛЬНЫЙ МЕНТОР
            </p>
            <h1>
              Меньше потерянности.
              <br />
              <em>Больше понимания.</em>
            </h1>
            <p>
              Путь в Python backend начинается с тебя. Aporia помогает выбрать
              следующий шаг, разобраться в задаче и увидеть, что действительно
              получается.
            </p>
            <div className="exercise-actions">
              <Link
                className="primary-button"
                href={configured ? "/signup" : "/preview"}
              >
                {configured ? "Начать свой путь" : "Попробовать Aporia"}
                <ArrowUpRight size={19} />
              </Link>
              {configured && (
                <Link className="text-link" href="/preview">
                  Сначала посмотреть
                  <ArrowRight size={15} />
                </Link>
              )}
            </div>
            <p className="quiet-copy">
              Ранняя версия · один маршрут · в твоём темпе
            </p>
          </div>
          <MentorVisual />
        </section>
        <section className="landing-steps" aria-label="Как устроено обучение">
          <article>
            <span>01 / ЗНАКОМСТВО</span>
            <h2>Сначала — твоя цель.</h2>
            <p>
              Расскажи об опыте, интересах и времени. Подтверди профиль, который
              ментор будет помнить.
            </p>
          </article>
          <article>
            <span>02 / ПРАКТИКА</span>
            <h2>Один понятный шаг.</h2>
            <p>
              Диагностика задаёт старт. Подсказки помогают дойти до решения, а
              свой проект связывает темы.
            </p>
          </article>
          <article>
            <span>03 / ПОНИМАНИЕ</span>
            <h2>Прогресс с основанием.</h2>
            <p>
              Навыки растут по результатам заданий. Повторение возвращает к
              тому, что полезно закрепить.
            </p>
          </article>
        </section>
        <section className="landing-invite glass-panel">
          <div>
            <p className="eyebrow">НЕ НУЖНО ЗНАТЬ ВСЁ ЗАРАНЕЕ</p>
            <h2>Достаточно первого вопроса.</h2>
            <p>
              Посмотри, как устроены занятия, без регистрации. Личная память и
              AI-диалог работают в аккаунте при подключённых сервисах.
            </p>
          </div>
          <Link className="secondary-button" href="/preview">
            Открыть пространство
            <ArrowUpRight size={17} />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <span>Aporia · учиться с пониманием</span>
        <Link href="/privacy">О твоих данных</Link>
        <Link href="/preview">Предпросмотр</Link>
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
