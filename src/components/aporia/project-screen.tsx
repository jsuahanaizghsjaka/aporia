"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertDialog } from "radix-ui";
import {
  ArrowRight,
  Check,
  Code,
  FloppyDisk,
  Sparkle,
} from "@phosphor-icons/react";
import { curriculum } from "@/lib/learning/curriculum";
import {
  projectTasks,
  projects,
  suggestedProject,
} from "@/lib/learning/projects";
import type { SkillId } from "@/lib/learning/types";
import { useProfile } from "./profile-provider";
import { LearningGate, useLearning } from "./learning-provider";
import { QuestionInput } from "./practice";
function ProjectTask({ skill }: { skill: SkillId }) {
  const { view, send, review, busy } = useLearning();
  const { preview } = useProfile();
  const project = view.state.project!,
    task = projectTasks[skill];
  const [draft, setDraft] = useState(project.artifacts[skill] ?? ""),
    [answer, setAnswer] = useState("");
  const saved = draft === (project.artifacts[skill] ?? "");
  const [pendingNavigation, setPendingNavigation] =
    useState<HTMLElement | null>(null);
  const allowNavigation = useRef(false);
  const codeReview = project.reviews[skill];
  const check = project.checks[skill];
  const question = view.projectQuestions.find((q) => q.skill === skill)!;
  useEffect(() => {
    if (saved) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeNavigate = (event: MouseEvent) => {
      if (allowNavigation.current) {
        allowNavigation.current = false;
        return;
      }
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href], .project-steps button")
          : null;
      if (!target) return;
      if (
        target instanceof HTMLAnchorElement &&
        (target.target === "_blank" ||
          (target.hash &&
            target.pathname === window.location.pathname &&
            target.search === window.location.search) ||
          target.href === window.location.href)
      )
        return;
      if (target.getAttribute("aria-current") === "step") return;
      if (target instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        setPendingNavigation(target);
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, [saved]);
  return (
    <section className="glass-panel project-workspace">
      <AlertDialog.Root
        open={!!pendingNavigation}
        onOpenChange={(open) => {
          if (!open) setPendingNavigation(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="draft-dialog-overlay" />
          <AlertDialog.Content className="glass-panel draft-dialog">
            <AlertDialog.Title>
              Сохранить работу перед уходом?
            </AlertDialog.Title>
            <AlertDialog.Description>
              В коде есть несохранённые изменения. Можно вернуться к
              редактированию и сохранить черновик.
            </AlertDialog.Description>
            <div className="exercise-actions">
              <AlertDialog.Cancel asChild>
                <button className="primary-button">Вернуться к коду</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  className="secondary-button"
                  onClick={() => {
                    allowNavigation.current = true;
                    pendingNavigation?.click();
                    setPendingNavigation(null);
                  }}
                >
                  Уйти без сохранения
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <span className="eyebrow">
        {curriculum.find((item) => item.id === skill)?.short} · ЭТАП ПРОЕКТА
      </span>
      <h2>{task.title}</h2>
      <p>{task.brief}</p>
      <ul className="project-criteria">
        {task.criteria.map((criterion) => (
          <li key={criterion}>{criterion}</li>
        ))}
      </ul>
      <label className="field-label">
        Код или описание решения
        <textarea
          className="artifact-editor"
          rows={12}
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={task.placeholder}
          maxLength={12000}
        />
      </label>
      <div className="exercise-actions">
        <button
          className="secondary-button"
          disabled={busy || saved}
          onClick={() =>
            void send({ type: "save_artifact", skill, artifact: draft })
          }
        >
          <FloppyDisk size={17} />
          {saved && draft ? "Черновик сохранён" : "Сохранить черновик"}
        </button>
        <button
          className="primary-button"
          disabled={busy || !saved || draft.trim().length < 20}
          onClick={() => void review(skill)}
        >
          <Sparkle size={17} />
          {busy ? "Подожди…" : "Разобрать с ментором"}
        </button>
      </div>
      <p className="quiet-copy">
        {preview
          ? "Черновик хранится в этом браузере. AI-разбор появится в аккаунте после подключения ментора."
          : "Ментор читает код и предлагает правки. Запуска кода и автоматического подтверждения тестов здесь нет."}
      </p>
      {codeReview && (
        <aside className="hint-panel">
          <h3>Разбор без запуска кода</h3>
          {codeReview.artifact !== draft && (
            <p className="review-stale">
              Разбор относится к предыдущему черновику. Сохрани изменения и
              запроси новый.
            </p>
          )}
          <p className="preserve-lines">{codeReview.text}</p>
        </aside>
      )}
      <details className="project-check" open={!!check}>
        <summary>
          Проверка понимания
          <span>
            {check?.correct ? "Ответ подтверждён" : "Один вопрос по решению"}
          </span>
        </summary>
        <p className="quiet-copy">
          Этот ответ подтверждает понимание принципа. Работоспособность всего
          проекта проверяется отдельным запуском и тестами.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send({ type: "project_answer", skill, answer });
          }}
        >
          <QuestionInput
            question={question}
            value={check?.correct ? check.answer : answer}
            onChange={setAnswer}
            disabled={busy || !!check?.correct}
          />
          <button
            className="secondary-button"
            disabled={
              busy ||
              !saved ||
              draft.trim().length < 20 ||
              !answer ||
              !!check?.correct
            }
          >
            Проверить понимание
            <ArrowRight size={16} />
          </button>
        </form>
        {check && (
          <div className="answer-result" role="status">
            <h3>
              {check.correct ? "Принцип понятен." : "Разберём этот момент."}
            </h3>
            <p>{view.projectFeedback[skill]}</p>
          </div>
        )}
      </details>
    </section>
  );
}
function ProjectContent() {
  const { view, send, busy } = useLearning();
  const { profile, href } = useProfile();
  const [skill, setSkill] = useState<SkillId>("python");
  const project = view.state.project;
  if (!view.state.diagnosticComplete)
    return (
      <section className="glass-panel empty-panel">
        <Code size={32} weight="light" />
        <h2>Проект начнётся с твоей точки старта.</h2>
        <p>
          Сначала определим цель и пройдём диагностику, затем выберем одну
          посильную идею.
        </p>
        <Link
          className="primary-button"
          href={href(
            profile.onboardingComplete ? "/diagnostic" : "/onboarding",
          )}
        >
          Продолжить
          <ArrowRight size={17} />
        </Link>
      </section>
    );
  if (!project) {
    const suggestion = suggestedProject(profile.interests);
    return (
      <>
        <p className="panel-description">
          Один проект на весь маршрут. По твоим интересам предлагаем «
          {suggestion.title}», но выбор за тобой.
        </p>
        <div className="project-options">
          {[...projects]
            .sort(
              (a, b) =>
                Number(b.id === suggestion.id) - Number(a.id === suggestion.id),
            )
            .map((item) => (
              <section className="glass-panel project-option" key={item.id}>
                <span className="eyebrow">
                  {item.id === suggestion.id
                    ? "ПО ТВОИМ ИНТЕРЕСАМ"
                    : "PYTHON BACKEND"}
                </span>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() =>
                    void send({ type: "choose_project", projectId: item.id })
                  }
                >
                  Выбрать проект
                  <ArrowRight size={16} />
                </button>
              </section>
            ))}
        </div>
      </>
    );
  }
  const selected = projects.find((item) => item.id === project.id)!;
  return (
    <>
      <div className="project-title">
        <div>
          <span className="eyebrow">ТВОЙ АКТИВНЫЙ ПРОЕКТ</span>
          <h2>{selected.title}</h2>
          <p>{selected.detail}</p>
        </div>
        <span className="quiet-badge">
          Проверки понимания: {project.checkpoints.length} / 8
        </span>
      </div>
      <div className="project-layout">
        <nav className="project-steps" aria-label="Этапы проекта">
          {curriculum.map((item, index) => (
            <button
              key={item.id}
              aria-current={skill === item.id ? "step" : undefined}
              onClick={() => setSkill(item.id)}
            >
              <span>
                {project.checkpoints.includes(item.id) ? (
                  <Check size={17} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              {item.short}
            </button>
          ))}
        </nav>
        <ProjectTask key={`${project.id}:${skill}`} skill={skill} />
      </div>
    </>
  );
}
export function ProjectScreen() {
  return (
    <div className="page-enter learning-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ОТ ИДЕИ ДО API</p>
          <h1>Твоя практика со смыслом.</h1>
          <p>Один проект. Восемь этапов. Код, который становится понятнее.</p>
        </div>
      </div>
      <LearningGate>
        <ProjectContent />
      </LearningGate>
    </div>
  );
}
