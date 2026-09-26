"use client";

import { ArrowRight, Check, MagicWand, Path, PencilSimple } from "@phosphor-icons/react";
import { roadmapWithState } from "@/lib/roadmaps/derive";
import { useLearning, LearningGate } from "./learning-provider";
import { useRoadmap } from "./use-roadmap";

export function AdaptiveRoadmapScreen() {
  const { view } = useLearning();
  const { roadmap, candidate, loading, busy, error, propose, save } = useRoadmap();
  const items = roadmapWithState(candidate ?? roadmap, view.state);
  const saved = !!roadmap && !candidate;
  return <div className="page-enter learning-page roadmap-page">
    <div className="page-heading"><div><p className="eyebrow">АДАПТИВНЫЙ МАРШРУТ · PYTHON BACKEND</p><h1>От точки старта — к своему API.</h1><p>Маршрут опирается на подтверждённые ответы и твою цель. Он не заменяет практику и не меняется без подтверждения.</p></div></div>
    <LearningGate>
      <section className="roadmap-summary glass-panel">
        <Path size={28} /><div><strong>{saved ? "Твой подтверждённый маршрут" : candidate ? "Черновик маршрута" : "Маршрут ещё не создан"}</strong><p>{saved ? "Текущий порядок можно адаптировать, но новая версия появится только после подтверждения." : "Сначала заверши профиль, цель и диагностику. Затем предложим порядок навыков."}</p></div>
        <button className="secondary-button" disabled={busy || loading || !view.state.diagnosticComplete} onClick={() => void propose()}><MagicWand size={17} />{busy ? "Готовим…" : saved ? "Адаптировать маршрут" : "Предложить маршрут"}</button>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {candidate && <section className="roadmap-confirm glass-panel"><div><strong>Проверь черновик</strong><p>До подтверждения он не записан и безопасно исчезнет при обновлении страницы.</p></div><button className="primary-button" disabled={busy} onClick={() => void save()}><Check size={17} />Подтвердить маршрут</button></section>}
      <ol className="roadmap-list">{items.map((item, index) => <li key={item.skill_id} className={`roadmap-item ${item.state}`}><span className="roadmap-position">{item.state === "completed" ? <Check size={16} /> : String(index + 1).padStart(2, "0")}</span><div><div className="roadmap-item-title"><strong>{item.title}</strong>{item.state === "current" && <span>СЕЙЧАС</span>}{item.state === "completed" && <span>ПОДТВЕРЖДЕНО</span>}</div><p>{item.reason}</p><small>{item.insight.reason}</small></div><ArrowRight size={18} aria-hidden="true" /></li>)}</ol>
      {!items.length && !loading && <p className="quiet-copy">Маршрут появится после диагностики. Каждый пункт получит короткое объяснение порядка.</p>}
    </LearningGate>
    <p className="quiet-copy"><PencilSimple size={15} /> Уровень подтверждается ответами и практикой; максимум mastery — 95%.</p>
  </div>;
}
