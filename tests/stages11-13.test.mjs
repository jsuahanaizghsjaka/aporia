import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { initialLearningState } from "../src/lib/learning/selectors.ts";
import { masteryInsight, masterySnapshot } from "../src/lib/learning/mastery.ts";
import { defaultRoadmap, roadmapWithState } from "../src/lib/roadmaps/derive.ts";
import { roadmapDraftSchema, validRoadmapOrder } from "../src/lib/roadmaps/schema.ts";

test("mastery is explainable, evidence-based and capped below false certainty", () => {
  const state = initialLearningState();
  assert.equal(masteryInsight(state, "python").result, "not_started");
  state.evidence.push({ id: "1", questionId: "python.1", skill: "python", kind: "exercise", correct: true, independence: 1, at: new Date().toISOString(), sessionId: randomUUID() });
  const result = masteryInsight(state, "python");
  assert.equal(result.result, "building");
  assert.ok(result.mastery_score < 100);
  assert.ok(result.mastery_score <= 95);
  assert.equal(masterySnapshot(state).evidence_count, 1);
});

test("roadmap contains all skills once and keeps prerequisite order", () => {
  const draft = defaultRoadmap();
  assert.equal(roadmapDraftSchema.safeParse(draft).success, true);
  assert.equal(validRoadmapOrder(draft), true);
  const bad = { items: [...draft.items].reverse() };
  assert.equal(validRoadmapOrder(bad), false);
  const rows = roadmapWithState(draft, initialLearningState());
  assert.equal(rows.filter((row) => row.state === "current").length, 1);
  assert.equal(rows[0].skill_id, "python");
});
