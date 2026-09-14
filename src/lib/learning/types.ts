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
});
const evidenceSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  skill: skillSchema,
  kind: z.enum(["diagnostic", "exercise", "review", "project"]),
  correct: z.boolean(),
  independence: z.number().min(0).max(1),
  at: z.iso.datetime(),
  sessionId: z.string(),
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
        }),
      ),
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
  z.object({ type: z.literal("start_diagnostic") }),
  z.object({
    type: z.literal("start_session"),
    mode: z.enum(["learn", "help"]),
    skill: skillSchema.optional(),
  }),
  z.object({ type: z.literal("hint") }),
  z.object({ type: z.literal("answer"), answer: z.string().trim().max(4000) }),
  z.object({ type: z.literal("next") }),
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
  "id" | "skill" | "prompt" | "code" | "choices" | "kind"
>;
export type LearningView = {
  state: LearningState;
  question: PublicQuestion | null;
  help: string | null;
  solution: string | null;
  projectQuestions: PublicQuestion[];
  projectFeedback: Record<string, string>;
};
