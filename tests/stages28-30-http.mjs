import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startAuthApp, cookieClient } from "./helpers/auth-app.mjs";
import { profileSchema } from "../src/lib/profile/schema.ts";
import { initialLearningState } from "../src/lib/learning/selectors.ts";
import { applyAction } from "../src/lib/learning/engine.ts";
import { skillIds } from "../src/lib/learning/types.ts";
import { memoryFromProfile } from "../src/lib/profile/memory.ts";

const app = await startAuthApp({
  withAI: true,
  withLearning: true,
  aiTimeoutMs: 10000,
});
const request = cookieClient(app.base),
  other = cookieClient(app.base);
const headers = { origin: app.base, "Content-Type": "application/json" };
const post = (path, data, client = request) =>
  client(path, { method: "POST", headers, body: JSON.stringify(data) });
const json = async (response, status = 200) => {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
};
const latest = () => app.controls.aiRequests.at(-1);
const assertMemory = (memory) => {
  assert.deepEqual(Object.keys(memory), [
    "version",
    "profile",
    "learning",
    "project",
    "recent",
  ]);
  assert.equal(
    memory.learning.skills.length,
    memory.learning.available ? 8 : 0,
  );
  assert.ok(memory.recent.sessions.length <= 5);
};
let learning;
const refresh = async () =>
  (learning = await json(await request("/api/learning")));
const mutate = (action) =>
  post("/api/learning", {
    action,
    version: learning.version,
    requestId: randomUUID(),
  });
try {
  const credentials = {
    email: "immediate-architecture@example.test",
    password: "Architecture-2026!",
  };
  await json(await post("/api/auth", { action: "signup", ...credentials }));
  const owner = app.users.get(credentials.email).user.id;
  const profile = profileSchema.parse({
    displayName: "Memory Owner",
    goal: "Сделать Python API",
    occupation: "CURRENT_OCCUPATION",
    education: "",
    notes: "OWNER_A_NOTE",
    onboardingComplete: true,
    dailyMinutes: 20,
  });
  app.profiles.get(owner).data = profile;
  await app.learning.profile(owner, profile, 0);
  let state = initialLearningState();
  const action = (a) =>
    (state = applyAction(state, a, profile, randomUUID(), new Date()));
  action({ type: "start_diagnostic" });
  for (let i = 0; i < 9; i++) action({ type: "answer", answer: "" });
  action({ type: "choose_project", projectId: "music" });
  action({
    type: "save_artifact",
    skill: "python",
    artifact: "def find_track(tracks, id):\n    return None\n",
  });
  action({ type: "set_project_mode", mode: "help" });
  await app.learning.asUser(
    owner,
    (tx) =>
      tx.query("select public.commit_learning_state($1,0,$2::jsonb)", [
        owner,
        JSON.stringify(state),
      ]),
    true,
  );
  for (let i = 0; i < 50; i++)
    app.messages.push({
      id: randomUUID(),
      user_id: owner,
      conversation: "learn",
      role: i % 2 ? "assistant" : "user",
      content: i < 40 ? "OLD_PRIVATE_HISTORY" : "recent question " + i,
      request_id: randomUUID(),
      created_at: new Date().toISOString(),
    });
  app.messages.push({
    id: randomUUID(),
    user_id: owner,
    conversation: "onboarding",
    role: "user",
    content: "Меня зовут Memory Owner, изучаю Python API.",
    request_id: randomUUID(),
    created_at: new Date().toISOString(),
  });
  const chat = await post("/api/mentor", {
    conversation: "learn",
    content: "Что учесть в моём графике?",
    requestId: randomUUID(),
  });
  assert.equal(chat.status, 200);
  assert.match(await chat.text(), /"type":"done"/);
  const context = JSON.parse(latest().input[0].content).memory;
  assertMemory(context);
  assert.equal(context.profile.occupation, "CURRENT_OCCUPATION");
  assert.equal(context.profile.education, "");
  assert.equal(context.project.id, "music");
  assert.equal(context.learning.diagnostic.answered, 9);
  assert.ok(latest().input.length <= 9);
  assert.doesNotMatch(JSON.stringify(latest()), /OLD_PRIVATE_HISTORY/);
  assert.match(latest().instructions, /Aporia exercise/);
  const onboarding = await post("/api/mentor", {
    conversation: "onboarding",
    content: "Хочу уточнить знакомство",
    requestId: randomUUID(),
  });
  assert.match(await onboarding.text(), /"type":"done"/);
  assert.match(latest().instructions, /Aporia onboarding/);
  assert.equal(latest().parallel_tool_calls, false);
  assertMemory(JSON.parse(latest().input[0].content).memory);

  const {
    onboarding_completed: _completed,
    personal_schedule: _schedule,
    ...candidate
  } = memoryFromProfile(profile);
  assert.equal(_completed, true);
  assert.equal(_schedule, null);
  app.controls.memoryCandidate = { ...candidate, mastery: 95 };
  await json(await post("/api/profile/extract", {}), 502);
  assert.deepEqual(app.profiles.get(owner).data, profile);
  app.controls.memoryCandidate = candidate;
  assert.equal(
    (await json(await post("/api/profile/extract", {}))).confirmed,
    false,
  );
  assertMemory(JSON.parse(latest().input).memory);

  // These are contract checks for stage 30, not reruns of older feature suites.
  await json(
    await request("/api/goals", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        summary: "Подтверждённая цель API",
        success_criteria: ["Создание записи через API"],
        target_date: null,
        version: 0,
        requestId: randomUUID(),
      }),
    }),
  );
  app.controls.roadmapCandidate = {
    items: skillIds
      .toReversed()
      .map((skill_id) => ({ skill_id, reason: "Проверяем порядок навыков" })),
  };
  await json(await post("/api/roadmap/propose", {}), 502);
  app.controls.roadmapCandidate = {
    items: skillIds.map((skill_id) => ({
      skill_id,
      reason: "Проверяем порядок навыков",
    })),
  };
  assert.equal(
    (await json(await post("/api/roadmap/propose", {}))).confirmed,
    false,
  );
  assert.equal(
    JSON.parse(latest().input).memory.profile.goal_summary,
    "Подтверждённая цель API",
  );

  await refresh();
  const before = structuredClone(learning);
  for (const mode of [
    "malformed",
    "structured-null",
    "structured-incomplete",
    "structured-refusal",
  ]) {
    app.controls.aiMode = mode;
    await json(
      await post("/api/learning/project-review", { skill: "python" }),
      503,
    );
    await refresh();
    assert.deepEqual(learning, before);
  }
  app.controls.aiMode = "success";
  app.controls.projectReviewCandidate = {
    reply: "Текст корректной длины",
    mastery: 95,
  };
  await json(
    await post("/api/learning/project-review", { skill: "python" }),
    503,
  );
  await refresh();
  assert.deepEqual(learning, before);
  delete app.controls.projectReviewCandidate;
  learning = await json(
    await post("/api/learning/project-review", { skill: "python" }),
  );
  assert.match(learning.state.project.reviews.python.text, /Код не запускался/);
  assertMemory(JSON.parse(latest().input).memory);
  assert.equal(latest().text.format.strict, true);
  assert.deepEqual(learning.state.evidence, before.state.evidence);

  const ask = {
    version: learning.version,
    requestId: randomUUID(),
    skill: "python",
    message: "Как обработать пустой список?",
  };
  app.controls.projectHelpCandidate = {
    reply: "Объяснение достаточной длины",
    decision: null,
    sql: "forged",
  };
  await json(await post("/api/learning/project-chat", ask), 502);
  delete app.controls.projectHelpCandidate;
  learning = await json(await post("/api/learning/project-chat", ask));
  assertMemory(JSON.parse(latest().input).memory);
  const callCount = app.controls.aiRequests.length;
  assert.deepEqual(
    await json(await post("/api/learning/project-chat", ask)),
    learning,
  );
  assert.equal(app.controls.aiRequests.length, callCount);

  app.controls.weeklyCandidate = { focus: "python", mastery: 95 };
  await json(
    await mutate({ type: "generate_weekly_review", source: "ai" }),
    502,
  );
  delete app.controls.weeklyCandidate;
  learning = await json(
    await mutate({ type: "generate_weekly_review", source: "ai" }),
  );
  assertMemory(JSON.parse(latest().input).memory);
  assert.equal(learning.state.weeklyReviews[0].sessions, 1);
  assert.equal(learning.state.focus, null);
  learning = await json(
    await mutate({
      type: "recommend_resources",
      skill: "python",
      source: "ai",
    }),
  );
  assert.match(latest().instructions, /Aporia resources/);
  assertMemory(JSON.parse(latest().input).memory);

  const saved = structuredClone(learning);
  app.controls.teacherCandidate = {
    explanation: "analogy",
    reflection: "test",
    score: 100,
  };
  await json(
    await mutate({
      type: "start_lesson",
      mode: "learn",
      minutes: 20,
      teacher: "ai",
    }),
    502,
  );
  await refresh();
  assert.deepEqual(learning, saved);
  delete app.controls.teacherCandidate;
  learning = await json(
    await mutate({
      type: "start_lesson",
      mode: "learn",
      minutes: 20,
      teacher: "ai",
    }),
  );
  const lessonContext = JSON.parse(latest().input);
  assertMemory(lessonContext.memory);
  assert.equal(
    lessonContext.memory.profile.goal_summary,
    "Подтверждённая цель API",
  );
  assert.equal(
    learning.state.sessions.at(-1).lesson.teacher.choice.explanation,
    "analogy",
  );

  await request("/auth/logout", {
    method: "POST",
    headers: { origin: app.base },
  });
  await json(await post("/api/auth", { action: "login", ...credentials }));
  assert.deepEqual(
    (await json(await request("/api/learning"))).state,
    learning.state,
  );
  await json(
    await post(
      "/api/auth",
      {
        action: "signup",
        email: "immediate-architecture-other@example.test",
        password: credentials.password,
      },
      other,
    ),
  );
  const otherChat = await post(
    "/api/mentor",
    {
      conversation: "learn",
      content: "Как пройти диагностику?",
      requestId: randomUUID(),
    },
    other,
  );
  assert.match(await otherChat.text(), /"type":"done"/);
  const otherMemory = JSON.parse(latest().input[0].content).memory;
  assertMemory(otherMemory);
  assert.equal(otherMemory.project, null);
  assert.equal(otherMemory.recent.sessions.length, 0);
  assert.doesNotMatch(
    JSON.stringify(latest()),
    /OWNER_A_NOTE|CURRENT_OCCUPATION/,
  );
  assert.match(latest().instructions, /Aporia diagnostic/);
  console.log(
    "PASS stages 28–30: bounded memory, canonical profile/goal, task prompts, six contracts, malformed/refused/forged output never persisted, retries, reload and account isolation (local AI/Auth/PostgreSQL fixtures).",
  );
} catch (error) {
  console.error(app.logs());
  throw error;
} finally {
  await app.close();
}
