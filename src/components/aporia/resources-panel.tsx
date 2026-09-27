"use client";
import { useState } from "react";
import { curriculum } from "@/lib/learning/curriculum";
import { findResource } from "@/lib/learning/resources";
import { recommendedSkill, activeSession } from "@/lib/learning/selectors";
import type { SkillId } from "@/lib/learning/types";
import { useLearning } from "./learning-provider";
import { useProfile } from "./profile-provider";

export function ResourcesPanel() {
  const { view, send, busy } = useLearning(),
    { preview, profile } = useProfile();
  const [chosen, setChosen] = useState<SkillId | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const skill =
    chosen ??
    activeSession(view.state)?.lesson?.plan.today_skill ??
    recommendedSkill(view.state);
  const latest = view.state.resourceSelections
    .filter((s) => s.skill === skill)
    .at(-1);
  const entries = savedOnly
    ? view.state.resourceSelections
        .flatMap((s) =>
          s.items
            .filter((i) => i.savedAt)
            .map((item) => ({ selection: s, item })),
        )
        .reverse()
    : (latest?.items.map((item) => ({ selection: latest, item })) ?? []);
  return (
    <section
      className="glass-panel weekly-panel resources-panel"
      aria-labelledby="resource-title"
      aria-busy={busy}
    >
      <span className="eyebrow">МАТЕРИАЛЫ К ТВОЕМУ ШАГУ</span>
      <h2 id="resource-title">Один источник. Затем практика.</h2>
      <p>
        Основной материал, до одного видео и один необязательный источник.
        Только ссылки на авторов и издателей; чтение не повышает mastery.
      </p>
      <div className="personalization-controls">
        <label className="field-label">
          Тема
          <select
            name="resourceSkill"
            value={skill}
            disabled={busy}
            onChange={(e) => {
              setChosen(e.target.value as SkillId);
              setSavedOnly(false);
            }}
          >
            {curriculum.map((s) => (
              <option key={s.id} value={s.id}>
                {s.short}
              </option>
            ))}
          </select>
        </label>
        {!preview && (
          <button
            className="primary-button"
            disabled={busy || !profile.onboardingComplete}
            onClick={() => {
              setSavedOnly(false);
              void send({ type: "recommend_resources", skill, source: "ai" });
            }}
          >
            {busy ? "Подбираем…" : "Подобрать с AI"}
          </button>
        )}
        <button
          className="secondary-button"
          disabled={busy || !profile.onboardingComplete}
          onClick={() => {
            setSavedOnly(false);
            void send({
              type: "recommend_resources",
              skill,
              source: "prepared",
            });
          }}
        >
          Подготовленная подборка
        </button>
        <button
          className="text-link"
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly(!savedOnly)}
        >
          {savedOnly ? "Текущая подборка" : "Моя библиотека"}
        </button>
      </div>
      {!profile.onboardingComplete && (
        <p>Подтверди профиль, чтобы подбирать материалы.</p>
      )}
      {!entries.length && (
        <p className="quiet-copy">
          {savedOnly
            ? "Здесь появятся сохранённые тобой ссылки."
            : "Выбери подборку. AI учитывает профиль, уровень, время и отзывы. Подготовленная подборка работает без AI."}
        </p>
      )}
      <div className="resource-list">
        {entries.map(({ selection, item }) => {
          const resource = findResource(item.resourceId);
          if (!resource) return null;
          const target = { selectionId: selection.id, resourceId: resource.id };
          return (
            <article
              className="resource-card"
              key={`${selection.id}:${resource.id}`}
            >
              <span className="eyebrow">
                {
                  {
                    docs: "ДОКУМЕНТАЦИЯ",
                    video: "ВИДЕО",
                    book: "КНИГА / ГЛАВА",
                    podcast: "ПОДКАСТ",
                  }[resource.kind]
                }{" "}
                · {selection.source === "ai" ? "AI-подбор" : "Без AI"}
              </span>
              <h3>{resource.title}</h3>
              <p>{item.reason}</p>
              <p className="quiet-copy">{resource.note}</p>
              <div className="personalization-controls">
                <a
                  className="text-link"
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    void send({ type: "open_resource", ...target })
                  }
                >
                  Открыть источник
                  <span className="sr-only"> в новой вкладке</span> ↗
                </a>
                <button
                  className="secondary-button"
                  disabled={busy || !!item.savedAt}
                  onClick={() =>
                    void send({ type: "save_resource", ...target })
                  }
                >
                  {item.savedAt ? "Сохранено" : "Сохранить ссылку"}
                </button>
              </div>
              {item.openedAt && (
                <fieldset className="resource-rating">
                  <legend>После изучения: помогло разобраться?</legend>
                  <div className="personalization-controls">
                    {[true, false].map((helpful) => (
                      <button
                        key={String(helpful)}
                        className="secondary-button"
                        disabled={busy}
                        aria-pressed={item.helpful === helpful}
                        onClick={() =>
                          void send({
                            type: "rate_resource",
                            ...target,
                            helpful,
                          })
                        }
                      >
                        {helpful ? "Помогло" : "Не помогло"}
                      </button>
                    ))}
                  </div>
                  {item.feedbackAt && (
                    <p className="save-note" role="status">
                      Отзыв сохранён.
                    </p>
                  )}
                </fieldset>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
