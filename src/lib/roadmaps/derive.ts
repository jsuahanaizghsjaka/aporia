import { curriculum } from "../learning/curriculum.ts";
import { masteryInsight } from "../learning/mastery.ts";
import type { LearningState } from "../learning/types.ts";
import type { RoadmapDraft, RoadmapRecord } from "./schema.ts";

export function defaultRoadmap(): RoadmapDraft {
  return {
    items: curriculum.map((skill) => ({
      skill_id: skill.id,
      reason: `${skill.detail}. Это следующий понятный слой Python backend.`,
    })),
  };
}

export function roadmapWithState(roadmap: RoadmapRecord | RoadmapDraft | null, state: LearningState) {
  if (!roadmap) return [];
  return roadmap.items.map((item, index) => {
    const insight = masteryInsight(state, item.skill_id);
    const skill = curriculum.find((candidate) => candidate.id === item.skill_id)!;
    const earlierUnfinished = roadmap.items.slice(0, index).some((earlier) =>
      masteryInsight(state, earlier.skill_id).result !== "demonstrated",
    );
    return {
      ...item,
      title: skill.title,
      short: skill.short,
      insight,
      state: insight.result === "demonstrated" ? "completed" : earlierUnfinished ? "upcoming" : "current",
    };
  });
}
