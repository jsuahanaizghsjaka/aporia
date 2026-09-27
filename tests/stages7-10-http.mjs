import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startAuthApp, cookieClient } from "./helpers/auth-app.mjs";
import { emptyProfile } from "../src/lib/profile/schema.ts";
import {
  memoryFromProfile,
  profileFromMemory,
} from "../src/lib/profile/memory.ts";
import { questionById } from "../src/lib/learning/question-bank.ts";
import { skillProgress } from "../src/lib/learning/selectors.ts";
const app = await startAuthApp({
    withAI: true,
    withLearning: true,
    aiTimeoutMs: 5000,
  }),
  request = cookieClient(app.base),
  headers = { origin: app.base, "Content-Type": "application/json" },
  creds = {
    email: "immediate-stages@example.test",
    password: "Test-password-2026!",
  };
const auth = (action) =>
  request("/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...creds }),
  });
const post = (path, body) =>
  request(path, { method: "POST", headers, body: JSON.stringify(body) });
async function saveProfile(p, version) {
  const f = new FormData();
  f.set("profile", JSON.stringify(p));
  f.set("version", String(version));
  const res = await request("/api/profile", {
    method: "PUT",
    headers: { origin: app.base },
    body: f,
  });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()).profile;
}
try {
  for (const path of ["/api/goals", "/api/skills"])
    assert.equal((await request(path)).status, 401);
  assert.equal((await post("/api/profile/extract", {})).status, 401);
  await auth("signup");
  const owner = app.users.get(creds.email).user.id;
  const initial = await saveProfile(
    {
      ...emptyProfile,
      displayName: "Sinon",
      goal: "Создать Python API для музыки",
      onboardingComplete: true,
      occupation: "Student",
      education: "College",
      notes: "Initial",
    },
    0,
  );
  app.messages.push({
    id: randomUUID(),
    user_id: owner,
    role: "user",
    conversation: "onboarding",
    content:
      "Работаю разработчиком. Учусь самостоятельно, музыка, 6 часов в неделю.",
    request_id: randomUUID(),
    created_at: new Date().toISOString(),
  });
  const { onboarding_completed, personal_schedule, ...candidate } =
    memoryFromProfile({
      ...initial,
      occupation: "Разработчик",
      education: "Самостоятельно",
      weeklyAvailableHours: 6,
      hobbies: "Бег",
      notes: "Короткие задачи",
    });
  assert.equal(onboarding_completed, true);
  assert.equal(personal_schedule, null);
  app.controls.memoryCandidate = candidate;
  let res = await post("/api/profile/extract", {});
  assert.equal(res.status, 200, await res.clone().text());
  let proposal = await res.json();
  assert.equal(proposal.confirmed, false);
  assert.equal(app.profiles.get(owner).data.occupation, "Student");
  assert.equal(app.controls.aiRequests.at(-1).text.format.type, "json_schema");
  const updated = await saveProfile(
    profileFromMemory(initial, proposal.candidate),
    initial.version,
  );
  assert.equal(updated.weeklyAvailableHours, 6);
  app.controls.aiMode = "malformed";
  assert.equal((await post("/api/profile/extract", {})).status, 502);
  app.controls.aiMode = "success";
  const deleted = await saveProfile(
    {
      ...updated,
      education: "",
      hobbies: "",
      notes: "Не больше 30 минут за раз",
    },
    updated.version,
  );
  await request("/auth/logout", { method: "POST", headers });
  assert.equal((await request("/dashboard")).status, 307);
  await auth("login");
  res = await post("/api/mentor", {
    conversation: "help",
    content: "Что ты помнишь обо мне?",
    requestId: randomUUID(),
  });
  assert.equal(res.status, 200, await res.clone().text());
  await res.text();
  const instructions = app.controls.aiRequests.at(-1).instructions;
  assert.match(instructions, /Не больше 30 минут за раз/);
  assert.match(instructions, /"education":""/);
  assert.match(instructions, /"hobbies":\[\]/);
  assert.equal(deleted.version, 3);
  console.log(
    "PASS stage 7: structured draft, confirmation, validation, field deletion and AI memory after logout/login",
  );
  const goal = {
    summary: "Создать музыкальный API на Python",
    success_criteria: [
      "Добавление и чтение плейлистов",
      "Тесты доступа проходят",
    ],
    target_date: "2026-10-30",
  };
  app.controls.goalCandidate = goal;
  res = await post("/api/goals/refine", { wish: "Хочу научиться backend" });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal((await res.json()).candidate.target_date, null);
  assert.equal((await (await request("/api/goals")).json()).goal, null);
  let learning = await (await request("/api/learning")).json();
  assert.equal(
    (
      await post("/api/learning", {
        version: 0,
        requestId: randomUUID(),
        action: { type: "start_diagnostic" },
      })
    ).status,
    422,
  );
  const payload = { ...goal, version: 0, requestId: randomUUID() },
    put = (p) =>
      request("/api/goals", {
        method: "PUT",
        headers,
        body: JSON.stringify(p),
      });
  const repeated = await Promise.all([put(payload), put(payload)]);
  for (const result of repeated)
    assert.equal(result.status, 200, await result.clone().text());
  let current = (await (await request("/api/goals")).json()).goal;
  assert.equal(current.version, 1);
  assert.equal(
    (await put({ ...payload, requestId: randomUUID() })).status,
    409,
  );
  assert.equal((await put({ ...payload, user_id: randomUUID() })).status, 400);
  assert.equal(
    (
      await put({
        ...payload,
        version: 1,
        requestId: randomUUID(),
        target_date: null,
      })
    ).status,
    200,
  );
  assert.equal(
    (await app.learning.db.query("select count(*) n from public.goals")).rows[0]
      .n,
    1,
  );
  console.log(
    "PASS stage 8: AI proposal, explicit goal, optional date, one SQL row, retries and version conflicts",
  );
  const action = async (a) => {
    const p = { version: learning.version, requestId: randomUUID(), action: a };
    const r = await post("/api/learning", p);
    assert.equal(r.status, 200, await r.clone().text());
    learning = await r.json();
    return p;
  };
  await action({ type: "start_diagnostic" });
  assert.equal(learning.state.sessions[0].questions.length, 9);
  assert.equal(
    (
      await post("/api/learning", {
        version: learning.version,
        requestId: randomUUID(),
        action: { type: "hint" },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await post("/api/mentor", {
        conversation: "help",
        content: "Дай ответ",
        requestId: randomUUID(),
      })
    ).status,
    409,
  );
  const kinds = new Set();
  for (let i = 0; i < 9; i++) {
    kinds.add(learning.question.kind);
    assert.equal(learning.question.answers, undefined);
    const q = questionById(learning.question.id);
    const p = await action({
      type: "answer",
      answer:
        q.kind === "coding" ? "def double(n):\n    return n + n" : q.answers[0],
    });
    if (i === 0) {
      const retry = await post("/api/learning", p);
      assert.equal(retry.status, 200);
      assert.equal((await retry.json()).state.evidence.length, 1);
      await request("/auth/logout", { method: "POST", headers });
      await auth("login");
      learning = await (await request("/api/learning")).json();
      assert.equal(learning.state.sessions[0].index, 1);
    }
  }
  assert.equal(kinds.size, 4);
  assert.equal(learning.state.diagnosticComplete, true);
  assert.equal(learning.state.evidence.length, 9);
  const graph = await (await request("/api/skills")).json();
  assert.equal(graph.skills.length, 9);
  assert.equal(graph.user_skills.length, 8);
  for (const s of graph.user_skills) {
    const p = skillProgress(learning.state, s.skill_id);
    assert.equal(s.mastery_score, p.mastery);
    assert.equal(s.confidence, p.confidence);
    assert.equal(s.evidence_count, p.count);
    assert.ok(s.last_practiced);
  }
  await request("/auth/logout", { method: "POST", headers });
  await auth("login");
  assert.deepEqual(
    (await (await request("/api/skills")).json()).user_skills,
    graph.user_skills,
  );
  const b = cookieClient(app.base);
  await b("/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "signup",
      email: "immediate-stages-b@example.test",
      password: creds.password,
    }),
  });
  assert.equal((await (await b("/api/goals")).json()).goal, null);
  const bg = await (await b("/api/skills")).json();
  assert.ok(
    bg.user_skills.every(
      (s) => s.mastery_score === 0 && s.evidence_count === 0,
    ),
  );
  console.log(
    "PASS stages 9–10: nine graded answers, four formats, resume, atomic SQL mastery and owner isolation",
  );
} catch (error) {
  console.error(app.logs());
  throw error;
} finally {
  await app.close();
}
