"use client";
import { useState } from "react";
import Link from "next/link";
import { curriculum } from "@/lib/learning/curriculum";
import { availableFocus } from "@/lib/learning/weekly";
import { weekKey } from "@/lib/profile/schedule";
import type { LearningState, SkillId } from "@/lib/learning/types";
import { useLearning } from "./learning-provider";
import { useProfile } from "./profile-provider";
const name = (id: SkillId) => curriculum.find((s) => s.id === id)!.short;
const date = (at: string) =>
  new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(at));
function Review({
  review,
  current,
}: {
  review: LearningState["weeklyReviews"][number];
  current: boolean;
}) {
  const { view, send, busy } = useLearning();
  const { href } = useProfile();
  const [focus, setFocus] = useState(
    review.confirmedFocus ?? review.suggestedFocus,
  );
  const allowed = availableFocus(view.state);
  return (
    <div className="weekly-snapshot">
      <p className="quiet-copy">
        Снимок {date(review.from)} — {date(review.at)} ·{" "}
        {review.source === "ai"
          ? "AI предложил фокус; статистика рассчитана сервером"
          : "Обзор по данным, без AI"}
      </p>
      <p>{review.summary}</p>
      <div className="weekly-numbers">
        <div>
          <strong>{review.sessions}</strong>
          <span>занятий завершено</span>
        </div>
        <div>
          <strong>{Math.round(review.seconds / 60)}</strong>
          <span>минут на ответы</span>
        </div>
        <div>
          <strong>{review.projectTotal}/8</strong>
          <span>задач проекта сдано</span>
        </div>
      </div>
      <p className="quiet-copy">
        Время относится только к измеренным ответам, не к чтению или всему
        занятию. Ответов без замера: {review.untrackedAnswers}. Новых
        свидетельств: {review.evidence}.
      </p>
      <p>
        {review.changes.length
          ? review.changes
              .map(
                (c) =>
                  `${name(c.skill)}: ${c.delta > 0 ? "+" : ""}${c.delta} п. п.`,
              )
              .join(" · ")
          : "Изменений оценки за период не зафиксировано."}
      </p>
      {review.incompleteHistory && (
        <p>
          Часть старых результатов без полной истории: их изменение уровня
          восстановить нельзя.
        </p>
      )}
      <p>
        Нужна практика:{" "}
        {review.weakSkills.map(name).join(", ") ||
          "нет подтверждённых слабых тем"}
        .
      </p>
      {current && (
        <>
          <label className="field-label">
            Фокус на следующие семь дней
            <select
              name="weeklyFocus"
              value={focus}
              disabled={busy}
              onChange={(e) => setFocus(e.target.value as SkillId)}
            >
              {allowed.map((id) => (
                <option value={id} key={id}>
                  {name(id)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={
              busy || !view.state.diagnosticComplete || !allowed.includes(focus)
            }
            onClick={() =>
              void send({
                type: "confirm_weekly_focus",
                reviewId: review.id,
                skill: focus,
              })
            }
          >
            Подтвердить фокус
          </button>
          <p className="quiet-copy">
            Миссия учтёт выбранную тему; запланированные повторения имеют
            приоритет. Маршрут не переписывается. Для изменения его структуры{" "}
            <Link className="text-link" href={href("/roadmap")}>
              предложи адаптацию маршрута
            </Link>{" "}
            и подтверди отдельно.
          </p>
        </>
      )}
      {review.confirmedFocus && (
        <p className="save-note" role="status">
          Подтверждён фокус: {name(review.confirmedFocus)}.
        </p>
      )}
    </div>
  );
}
export function WeeklyReviewPanel() {
  const { view, send, busy } = useLearning(),
    { profile, preview } = useProfile();
  const currentWeek = weekKey(new Date(), profile.schedule?.timeZone);
  const current = view.state.weeklyReviews.find((r) => r.week === currentWeek);
  const previous = view.state.weeklyReviews
    .filter((r) => r.id !== current?.id)
    .slice()
    .reverse();
  return (
    <section
      className="glass-panel weekly-panel"
      aria-labelledby="weekly-title"
      aria-busy={busy}
    >
      <span className="eyebrow">ЕЖЕНЕДЕЛЬНЫЙ ОБЗОР</span>
      <h2 id="weekly-title">Посмотреть назад. Выбрать следующий шаг.</h2>
      {busy && <p role="status" className="quiet-copy">Обрабатываем действие…</p>}
      {current ? (
        <Review key={current.id} review={current} current />
      ) : (
        <>
          <p>
            Сохраним итоги последних семи дней. Один неизменяемый снимок в
            календарную неделю; новые результаты попадут в следующий обзор.
          </p>
          <div className="personalization-controls">
            {!preview && (
              <button
                className="primary-button"
                disabled={busy || !profile.onboardingComplete}
                onClick={() =>
                  void send({ type: "generate_weekly_review", source: "ai" })
                }
              >
                Создать обзор с AI
              </button>
            )}
            <button
              className="secondary-button"
              disabled={busy || !profile.onboardingComplete}
              onClick={() =>
                void send({
                  type: "generate_weekly_review",
                  source: "prepared",
                })
              }
            >
              Создать обзор по данным
            </button>
          </div>
        </>
      )}
      {!!previous.length && (
        <details className="weekly-history">
          <summary>Прошлые обзоры ({previous.length})</summary>
          {previous.map((r) => (
            <Review key={r.id} review={r} current={false} />
          ))}
        </details>
      )}
    </section>
  );
}
