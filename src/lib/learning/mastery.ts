import { curriculum } from "./curriculum.ts";
import { skillProgress } from "./selectors.ts";
import type { LearningState, SkillId } from "./types.ts";

export type MasteryResult = "not_started" | "building" | "demonstrated";

export type MasteryInsight = {
  skill_id: SkillId;
  result: MasteryResult;
  mastery_score: number;
  confidence: number;
  evidence_count: number;
  last_practiced: string | null;
  reason: string;
};

export function masteryInsight(state: LearningState, skill: SkillId): MasteryInsight {
  const progress = skillProgress(state, skill);
  const independent = state.evidence.filter(
    (item) => item.skill === skill && item.correct && item.independence === 1,
  ).length;
  const result: MasteryResult = !progress.count
    ? "not_started"
    : progress.mastery >= 70 && progress.confidence >= 45
      ? "demonstrated"
      : "building";
  const reason = !progress.count
    ? "Пока нет проверенных ответов: самооценка и просмотр материалов не меняют уровень."
    : result === "demonstrated"
      ? `${independent} самостоятельных верных ответа и ${progress.count} свидетельств подтверждают устойчивую опору.`
      : `Есть ${progress.count} свидетельств, из них ${independent} самостоятельных верных. Нужна ещё практика или повторение.`;
  return {
    skill_id: skill,
    result,
    mastery_score: progress.mastery,
    confidence: progress.confidence,
    evidence_count: progress.count,
    last_practiced: progress.last?.at ?? null,
    reason,
  };
}

export function masterySnapshot(state: LearningState) {
  const skills = curriculum.map((skill) => masteryInsight(state, skill.id));
  const evidence_count = skills.reduce((sum, skill) => sum + skill.evidence_count, 0);
  return {
    overall_mastery: Math.round(
      skills.reduce((sum, skill) => sum + skill.mastery_score, 0) / skills.length,
    ),
    overall_confidence: Math.round(
      skills.reduce((sum, skill) => sum + skill.confidence, 0) / skills.length,
    ),
    evidence_count,
    skills,
    weak_skills: [...skills]
      .filter((skill) => skill.evidence_count > 0 || skill.mastery_score === 0)
      .sort((a, b) => a.mastery_score - b.mastery_score)
      .slice(0, 3),
  };
}
