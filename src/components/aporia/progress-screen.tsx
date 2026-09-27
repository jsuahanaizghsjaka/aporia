"use client";
import Link from "next/link";
import { previewGraph } from "@/lib/learning/skill-graph";
import {
  progressGroup,
  progressGroups,
  type ProgressGroup,
} from "@/lib/learning/history";
import { LearningHistory, EvidenceList } from "./learning-history";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, ChartLineUp } from "@phosphor-icons/react";
import { curriculum } from "@/lib/learning/curriculum";
import { dueReviews, skillProgress } from "@/lib/learning/selectors";
import { WeeklyReviewPanel } from "./weekly-review-panel";
import { useProfile } from "./profile-provider";
import { LearningGate, useLearning } from "./learning-provider";
import { Feedback } from "./practice";
const date = (value: string) =>
  new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export function SkillRows({ resources = false }: { resources?: boolean }) {
  const { view, send } = useLearning();
  const { href } = useProfile();
  const graph = previewGraph(view.state);
  const [group, setGroup] = useState<ProgressGroup | "all">("all");
  return (
    <div className="glass-panel skill-table">
      <div className="skill-root">
        <span className="eyebrow">КАРТА НАВЫКОВ</span>
        <h2>Python backend</h2>
        <p>8 направлений · уровень подтверждается ответами и практикой.</p>
      </div>
      {!resources && (
        <div className="progress-filters">
          <label htmlFor="skill-group">Группа навыков</label>
          <select
            id="skill-group"
            value={group}
            onChange={(e) => setGroup(e.target.value as ProgressGroup | "all")}
          >
            <option value="all">Все навыки</option>
            {Object.entries(progressGroups).map(([key, label]) => (
              <option key={key} value={key}>
                {label} (
                {
                  curriculum.filter(
                    (s) =>
                      progressGroup(skillProgress(view.state, s.id)) === key,
                  ).length
                }
                )
              </option>
            ))}
          </select>
          <p className="quiet-copy">
            Сильные: от 70% mastery и 45% уверенности. В процессе: от 35%. Ниже
            — нужна практика. Без ответов — не начато.
          </p>
        </div>
      )}
      {curriculum.map((skill, index) => {
        const evidence = skillProgress(view.state, skill.id);
        const stored = graph.user_skills.find((s) => s.skill_id === skill.id)!;
        const progress = {
          ...evidence,
          mastery: stored.mastery_score,
          confidence: stored.confidence,
          count: stored.evidence_count,
        };
        const category = progressGroup(progress);
        if (!resources && group !== "all" && group !== category) return null;
        const prerequisite = curriculum.find(
          (item) => item.id === skill.prerequisite,
        );
        return (
          <section className="skill-row" key={skill.id}>
            <span className="curriculum-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="skill-copy">
              <h2>{skill.title}</h2>
              {!resources && (
                <span className={`skill-status status-${category}`}>
                  {progressGroups[category]}
                </span>
              )}
              <p>{skill.detail}</p>
              <small>
                Python backend → {skill.short}
                {stored.last_practiced
                  ? ` · Последняя практика: ${date(stored.last_practiced)}`
                  : " · Пока нет практики"}
              </small>
              {resources && prerequisite && (
                <small>Опора: {prerequisite.short}</small>
              )}
            </div>
            <div className="skill-signal">
              <strong>
                {progress.count ? `${progress.mastery}%` : "Нет данных"}
              </strong>
              <progress
                value={progress.mastery}
                max={100}
                aria-label={`${skill.short}: уровень владения`}
              />
              <small>
                {progress.count
                  ? `Уверенность ${progress.confidence}% · свидетельств ${progress.count}`
                  : "Появятся после практики"}
              </small>
            </div>
            {resources ? (
              <details className="resource-detail">
                <summary>Материал</summary>
                <p>
                  Основной источник · официальная документация. Открой нужный
                  раздел и вернись к заданию.
                </p>
                <a
                  className="text-link"
                  href={skill.resource}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    void send({ type: "resource_open", skill: skill.id })
                  }
                >
                  Открыть документацию
                  <ArrowUpRight size={15} />
                  <span className="sr-only">, в новой вкладке</span>
                </a>
                {view.state.diagnosticComplete && (
                  <Feedback target={`resource:${skill.id}`} />
                )}
              </details>
            ) : (
              <details className="evidence-detail">
                <summary>Почему такой уровень?</summary>
                {progress.count ? (
                  <EvidenceList
                    entries={view.state.evidence.filter(
                      (e) => e.skill === skill.id,
                    )}
                  />
                ) : (
                  <p>
                    Ещё нет проверенных ответов. Просмотр материалов не меняет
                    уровень.
                  </p>
                )}
                <Link className="text-link" href={href("/learn")}>
                  Продолжить практику
                </Link>
              </details>
            )}
          </section>
        );
      })}
      {!resources &&
        group !== "all" &&
        !curriculum.some(
          (s) => progressGroup(skillProgress(view.state, s.id)) === group,
        ) && (
          <p className="empty-skill-group" role="status">
            В этой группе пока нет навыков.
          </p>
        )}
    </div>
  );
}
function ProgressContent() {
  const { view } = useLearning();
  const { href } = useProfile();
  const now = new Date();
  const due = dueReviews(view.state, now);
  const next = Object.entries(view.state.reviews).sort((a, b) =>
    a[1].due.localeCompare(b[1].due),
  )[0];
  return (
    <>
      {!view.state.evidence.length && (
        <section className="glass-panel progress-empty">
          <ChartLineUp size={28} />
          <div>
            <h2>Пока нет результатов практики.</h2>
            <p>
              Уровни появятся после ответов. Просмотр материалов их не повышает.
            </p>
          </div>
          <Link className="secondary-button" href={href("/diagnostic")}>
            Начать
            <ArrowRight size={16} />
          </Link>
        </section>
      )}
      <SkillRows />
      <div className="review-callout">
        <div>
          <h2>
            {due.length
              ? `Пора повторить: ${due.length}`
              : "Повторение в твоём ритме"}
          </h2>
          <p>
            {due.length
              ? "Следующее занятие начнётся с заданий, к которым пора вернуться."
              : next
                ? `Ближайшее повторение — ${date(next[1].due)}.`
                : "После первого ответа вернёмся к теме через день."}
          </p>
        </div>
        <Link className="text-link" href={href("/learn")}>
          К занятию
          <ArrowRight size={16} />
        </Link>
      </div>
      <WeeklyReviewPanel />
      <LearningHistory />
    </>
  );
}
export function ProgressScreen() {
  return (
    <div className="page-enter learning-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ПОДТВЕРЖДЕНО ПРАКТИКОЙ</p>
          <h1>Понимание оставляет след.</h1>
          <p>Что получилось, что требует внимания и когда вернуться к теме.</p>
        </div>
      </div>
      <LearningGate>
        <ProgressContent />
      </LearningGate>
    </div>
  );
}
