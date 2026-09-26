import { z } from "zod";
export const skillIds = [
  "python",
  "git",
  "sql",
  "http",
  "fastapi",
  "auth",
  "testing",
  "docker",
] as const;
export const skillSchema = z.enum(skillIds);
export type SkillId = z.infer<typeof skillSchema>;
export const projectIds = ["tasks", "music", "sport", "books"] as const;
const resultSchema = z.object({
  questionId: z.string().max(60),
  answer: z.string().max(4000),
  correct: z.boolean(),
  stage: z.number().int().min(0).max(5),
  at: z.iso.datetime(),
  hints_used: z.number().int().min(0).max(5).optional(),
  skill_id: skillSchema.optional(),
  time_spent: z.number().int().min(0).max(7200).optional(),
});
export const teacherChoiceSchema = z.strictObject({
  explanation: z.enum(["concept", "analogy", "mistake"]),
  reflection: z.enum(["boundary", "example", "test"]),
});
export const lessonPlanSchema = z.object({
  today_skill: skillSchema,
  estimated_time: z.number().int().min(5).max(120),
  reason: z.string().max(1500),
  goal: z.string().max(500),
  theory: z.number().int().positive(),
  exercise: z.number().int().positive(),
  project: z.number().int().positive(),
});
const sessionSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["diagnostic", "practice", "review"]),
  mode: z.enum(["learn", "help"]),
  questions: z.array(z.string().max(60)).max(10),
  index: z.number().int().min(0).max(10),
  stage: z.number().int().min(0).max(5),
  results: z.array(resultSchema).max(10),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  minutes: z.number().int().min(5).max(120),
  attempts: z.array(resultSchema).max(100).optional(),
  questionStartedAt: z.iso.datetime().optional(),
  lesson: z
    .object({
      plan: lessonPlanSchema,
      phase: z.enum(["theory", "exercise", "project"]),
      teacher: z.object({
        source: z.enum(["ai", "prepared"]),
        choice: teacherChoiceSchema,
        explanation: z.string().min(1).max(2000),
        reflection: z.string().min(1).max(1000),
      }),
      reflection: z.string().max(4000).optional(),
    })
    .optional(),
});
const evidenceSchema = z.object({
  answer: z.string().max(4000).optional(),
  source_id: z.string().min(1).max(200).optional(),
  history_complete: z.boolean().optional(),
  mastery_changes: z
    .array(
      z.object({
        before: z.number().int().min(0).max(95),
        after: z.number().int().min(0).max(95),
        at: z.iso.datetime(),
      }),
    )
    .max(100)
    .optional(),
  id: z.string(),
  questionId: z.string(),
  skill: skillSchema,
  kind: z.enum(["diagnostic", "exercise", "quiz", "review", "project"]),
  correct: z.boolean(),
  independence: z.number().min(0).max(1),
  at: z.iso.datetime(),
  sessionId: z.string(),
  hints_used: z.number().int().min(0).max(5).optional(),
});
export const stateSchema = z.object({
  schema: z.literal(1),
  diagnosticComplete: z.boolean(),
  sessions: z.array(sessionSchema).max(1000),
  activeSession: z.string().nullable(),
  evidence: z.array(evidenceSchema).max(5000),
  reviews: z.record(
    z.string(),
    z.object({
      due: z.iso.datetime(),
      interval: z.number().int().min(0).max(5),
    }),
  ),
  project: z
    .object({
      id: z.enum(projectIds),
      startedAt: z.iso.datetime(),
      artifacts: z.record(z.string(), z.string().max(12000)),
      checkpoints: z.array(skillSchema).max(8),
      checks: z.record(z.string(), resultSchema),
      reviews: z.record(
        z.string(),
        z.object({
          text: z.string().max(12000),
          artifact: z.string().max(12000),
          at: z.iso.datetime(),
          mode: z.enum(["learn", "help"]).optional(),
        }),
      ),
      plan: z
        .object({
          title: z.string().max(200),
          goal: z.string().max(500),
          interests: z.string().max(500),
          reason: z.string().max(1500),
          tasks: z
            .array(
              z.object({
                skill: skillSchema,
                title: z.string().max(200),
                brief: z.string().max(2000),
                criteria: z.array(z.string().max(500)).max(6),
                level: z.enum(["foundation", "practice", "challenge"]),
              }),
            )
            .length(8),
        })
        .optional(),
      mode: z.enum(["learn", "help"]).optional(),
      assistance: z
        .record(z.string(), z.number().int().min(0).max(5))
        .optional(),
      submissions: z
        .record(
          z.string(),
          z.object({
            artifact: z.string().max(12000),
            report: z.string().min(30).max(4000),
            at: z.iso.datetime(),
          }),
        )
        .optional(),
      messages: z
        .array(
          z.object({
            id: z.uuid(),
            skill: skillSchema,
            mode: z.enum(["learn", "help"]),
            question: z.string().max(2000),
            reply: z.string().max(6000),
            decision: z.string().max(1000).nullable(),
            at: z.iso.datetime(),
          }),
        )
        .max(100)
        .optional(),
      decisions: z
        .array(
          z.object({
            id: z.uuid(),
            skill: skillSchema,
            text: z.string().min(5).max(1000),
            at: z.iso.datetime(),
          }),
        )
        .max(30)
        .optional(),
    })
    .nullable(),
  feedback: z
    .array(
      z.object({
        target: z.string().max(80),
        rating: z.enum(["hard", "right", "easy"]),
        note: z.string().max(500),
        at: z.iso.datetime(),
      }),
    )
    .max(1000),
  events: z
    .array(z.object({ name: z.string().max(50), at: z.string() }))
    .max(300),
  focus: skillSchema.nullable(),
  requestIds: z.array(z.uuid()).max(200),
});
export type LearningState = z.infer<typeof stateSchema>;
export type Session = LearningState["sessions"][number];
export type Evidence = LearningState["evidence"][number];
export const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("set_mode"),
    mode: z.enum(["learn", "help"]),
  }),
  z.strictObject({
    type: z.literal("set_project_mode"),
    mode: z.enum(["learn", "help"]),
  }),
  z.strictObject({
    type: z.literal("submit_task"),
    skill: skillSchema,
    report: z.string().trim().min(30).max(4000),
  }),
  z.strictObject({
    type: z.literal("save_decision"),
    skill: skillSchema,
    text: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    type: z.literal("start_lesson"),
    minutes: z.number().int().min(5).max(120),
    mode: z.enum(["learn", "help"]),
    teacher: z.enum(["ai", "prepared"]),
  }),
  z.strictObject({ type: z.literal("finish_theory") }),
  z.strictObject({
    type: z.literal("finish_project"),
    reflection: z.string().trim().min(20).max(4000),
  }),
  z.object({ type: z.literal("start_diagnostic") }),
  z.object({
    type: z.literal("start_session"),
    mode: z.enum(["learn", "help"]),
    skill: skillSchema.optional(),
  }),
  z.strictObject({ type: z.literal("hint") }),
  z.strictObject({
    type: z.literal("answer"),
    answer: z.string().trim().max(4000),
  }),
  z.strictObject({ type: z.literal("next") }),
  z.object({
    type: z.literal("choose_project"),
    projectId: z.enum(projectIds),
  }),
  z.object({
    type: z.literal("save_artifact"),
    skill: skillSchema,
    artifact: z.string().max(12000),
  }),
  z.object({
    type: z.literal("project_answer"),
    skill: skillSchema,
    answer: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal("feedback"),
    target: z.string().min(1).max(80),
    rating: z.enum(["hard", "right", "easy"]),
    note: z.string().trim().max(500),
  }),
  z.object({ type: z.literal("set_focus"), skill: skillSchema.nullable() }),
  z.object({ type: z.literal("resource_open"), skill: skillSchema }),
]);
export type LearningAction = z.infer<typeof actionSchema>;
export type LearningProfile = {
  onboardingComplete: boolean;
  dailyMinutes: number;
  interests: string;
  goal: string;
};
export type Question = {
  level?: "foundation" | "practice" | "challenge";
  kind?: "multiple_choice" | "short_answer" | "code_reasoning" | "coding";
  id: string;
  skill: SkillId;
  prompt: string;
  code?: string;
  choices?: string[];
  answers: string[];
  hints: [string, string];
  explanation: string;
  partial: string;
  solution: string;
};
export type PublicQuestion = Pick<
  Question,
  "id" | "skill" | "prompt" | "code" | "choices" | "kind" | "level"
>;
export type LearningView = {
  state: LearningState;
  question: PublicQuestion | null;
  help: string | null;
  solution: string | null;
  projectQuestions: PublicQuestion[];
  projectFeedback: Record<string, string>;
};
