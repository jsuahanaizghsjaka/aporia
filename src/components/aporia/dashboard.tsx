"use client";

import Link from "next/link";
import { GoalSummary } from "./goal-editor";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  Code,
  ChatCircleDots,
  Compass,
  Check,
  CaretRight,
  ChartLineUp,
  FolderSimple,
  Sparkle,
} from "@phosphor-icons/react";
import { useProfile } from "./profile-provider";
import { useLearning } from "./learning-provider";
import { masterySnapshot } from "@/lib/learning/mastery";
import { projects } from "@/lib/learning/projects";
import { MentorVisual } from "./mentor-visual";
import { useMission } from "./use-mission";

export function Dashboard() {
  const { profile, href } = useProfile();
  const ready = profile.onboardingComplete;
  const { view, loading, ready: memoryReady, error, refresh } = useLearning();
  const missionState = useMission();
  const mission = missionState.mission;
  const mastery = masterySnapshot(view.state);
  const currentProject = view.state.project
    ? projects.find((project) => project.id === view.state.project?.id)
    : null;
  return (
    <div className="dashboard page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="status-dot" /> ТВОЁ МЕСТО ДЛЯ РОСТА
          </p>
          <h1>
            {profile.displayName
              ? `С возвращением, ${profile.displayName}.`
              : "Всё начинается с любопытства."}
          </h1>
          <p>Большая цель. Один понятный шаг сегодня.</p>
        </div>
        <span className="quiet-badge">
          <Code size={15} /> Python backend
        </span>
      </div>
      {ready && <GoalSummary />}
      {ready && memoryReady && (
        <section
          className="dashboard-signals"
          aria-label="Твой подтверждённый прогресс"
        >
          <div className="signal-card glass-panel">
            <ChartLineUp size={21} />
            <span>Подтверждённый прогресс</span>
            <strong>{mastery.overall_mastery}%</strong>
            <small>
              Уверенность {mastery.overall_confidence}% ·{" "}
              {mastery.evidence_count} evidence
            </small>
          </div>
          <div className="signal-card glass-panel">
            <Compass size={21} />
            <span>Нужна практика</span>
            <strong>
              {mastery.weak_skills
                .map((skill) => skill.skill_id.toUpperCase())
                .join(" · ") || "Python"}
            </strong>
            <small>Уровень растёт только после проверенного ответа.</small>
          </div>
          <div className="signal-card glass-panel">
            <FolderSimple size={21} />
            <span>Текущий проект</span>
            <strong>
              {currentProject?.title ?? "Выбери после диагностики"}
            </strong>
            <small>
              {currentProject?.detail ??
                "Проект свяжет темы с реальной задачей."}
            </small>
          </div>
        </section>
      )}
      <section
        className="mission-panel glass-panel"
        aria-labelledby="mission-title"
      >
        <div className="mission-copy">
          <div className="section-kicker">
            <span className="step-tag">
              {ready ? "ТВОЙ СЛЕДУЮЩИЙ ШАГ" : "УРОК 0"}
            </span>
            <span>
              <Clock size={14} />
              {`${mission.estimated_time} минут`}
            </span>
          </div>
          <h2 id="mission-title">
            {ready ? (
              <em>
                {memoryReady
                  ? `${mission.title}.`
                  : loading
                    ? "Открываем твой следующий шаг."
                    : "Вернёмся к твоему занятию."}
              </em>
            ) : (
              <>
                Не просто учиться.
                <br />
                <em>Понимать.</em>
              </>
            )}
          </h2>
          <p>
            {ready
              ? memoryReady
                ? mission.reason
                : loading
                  ? "Загружаем сохранённый прогресс…"
                  : error || "Учебная память временно недоступна."
              : "Я Aporia, твой ментор. Расскажи, куда хочешь прийти. Вместе превратим это в понятный маршрут."}
          </p>
          <div className="mission-actions">
            {missionState.error && (
              <p role="alert">
                {missionState.error}{" "}
                <button
                  className="text-link"
                  onClick={() => void missionState.refresh()}
                >
                  Повторить загрузку
                </button>
              </p>
            )}
            {ready && !memoryReady ? (
              <button
                className="primary-button"
                disabled={loading}
                onClick={() => void refresh()}
              >
                {loading ? "Загружаем…" : "Попробовать ещё раз"}
                <ArrowRight size={17} />
              </button>
            ) : missionState.loading ? (
              <span role="status">Подбираем следующий шаг…</span>
            ) : (
              <Link className="primary-button" href={href(mission.path)}>
                {ready ? "Продолжить" : "Давай познакомимся"}
                <ArrowUpRight size={19} />
              </Link>
            )}
            <span className="mission-note">
              {ready
                ? view.state.diagnosticComplete
                  ? "Сохраним каждый ответ"
                  : "Без подсказок и оценок тебя"
                : "Без анкет. Просто разговор."}
            </span>
          </div>
        </div>
        <MentorVisual />
        <span className="mission-star star-one" aria-hidden="true">
          ✦
        </span>
        <span className="mission-star star-two" aria-hidden="true">
          +
        </span>
      </section>
      <div className="dashboard-lower">
        <section className="route-overview" aria-labelledby="route-heading">
          <div className="section-heading">
            <h2 id="route-heading">От вопроса — к своему API</h2>
            <Link href={href("/roadmap")} className="text-link">
              Весь маршрут <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="journey-line">
            <Link
              href={href("/onboarding")}
              className={`journey-step ${ready ? "complete" : "current"}`}
            >
              <span className="journey-number">
                {ready ? <Check size={17} /> : "01"}
              </span>
              <strong>Знакомство</strong>
              <small>Твоя цель и ритм</small>
              <span className="journey-state">
                {ready ? "Готово" : "Начни здесь"}
              </span>
            </Link>
            <Link
              href={href("/diagnostic")}
              className={`journey-step ${view.state.diagnosticComplete ? "complete" : ready ? "current" : ""}`}
            >
              <span className="journey-number">02</span>
              <strong>Точка старта</strong>
              <small>Что уже получается</small>
              <span className="journey-state">
                {view.state.diagnosticComplete
                  ? "Готово"
                  : ready
                    ? "Следующий шаг"
                    : "Далее"}
              </span>
            </Link>
            <Link
              href={href("/learn")}
              className={`journey-step ${view.state.diagnosticComplete ? "current" : ""}`}
            >
              <span className="journey-number">03</span>
              <strong>Практика</strong>
              <small>От понимания к навыку</small>
              <span className="journey-state">В твоём темпе</span>
            </Link>
          </div>
          <div className="learning-principle">
            <Sparkle size={19} />
            <p>
              Прогресс — это то, что ты можешь сделать.
              <br />
              <span>Будем отмечать навыки по результатам практики.</span>
            </p>
          </div>
        </section>
        <section
          className="focus-panel glass-panel"
          aria-labelledby="focus-heading"
        >
          <div className="section-heading">
            <span className="eyebrow">ТВОЙ ФОКУС</span>
            <Compass size={22} />
          </div>
          <h2 id="focus-heading">
            {profile.goal || "У каждой цели свой путь."}
          </h2>
          <p>
            {profile.goal
              ? `${profile.dailyMinutes} минут в день — время для одного посильного шага.`
              : "Определим, зачем тебе Python, и выберем первый проект под твои интересы."}
          </p>
          <Link
            href={href(profile.goal ? "/profile" : "/onboarding")}
            className="text-link"
          >
            {profile.goal ? "Настроить свой ритм" : "Найти свою цель"}
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <Link className="mentor-shortcut" href={href("/learn")}>
        <span className="shortcut-icon">
          <ChatCircleDots size={22} />
        </span>
        <span>
          <strong>Есть вопрос? Разберём вместе.</strong>
          <small>Подсказка, объяснение или помощь с кодом</small>
        </span>
        <CaretRight size={20} />
      </Link>
    </div>
  );
}
