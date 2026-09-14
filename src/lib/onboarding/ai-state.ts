import { z } from "zod";
import { profileTextFields } from "./lesson-zero.ts";
export const onboardingKeys = [
  "displayName",
  "goal",
  "context",
  "experience",
  "workStudy",
  "weeklyAvailability",
  "interests",
  "hobbies",
  "preferences",
  "dailyMinutes",
  "currentProjects",
] as const;
export type OnboardingKey = (typeof onboardingKeys)[number];
const fieldSchema = z.enum(onboardingKeys);
const factSchema = z
  .object({
    status: z.enum(["unknown", "provided", "skipped"]),
    value: z.string().max(1000),
    evidence: z.string().max(4000),
  })
  .strict();
const stateSchema = z
  .object({
    version: z.literal(1),
    phase: z.enum(["collecting", "review"]),
    fields: z.record(fieldSchema, factSchema),
  })
  .strict();
export type OnboardingState = z.infer<typeof stateSchema>;
export const onboardingActionSchema = z
  .object({
    reply: z.string().trim().min(1).max(4000),
    updates: z
      .array(
        z
          .object({
            field: fieldSchema,
            status: z.enum(["provided", "skipped"]),
            value: z.string().max(1000),
            evidence: z.string().trim().min(1).max(4000),
          })
          .strict(),
      )
      .max(11),
  })
  .strict();
export const reviewSnapshotSchema = z
  .object({
    ready: z.boolean(),
    missing: z.array(fieldSchema),
    skipped: z.array(fieldSchema),
    candidate: z
      .object({
        displayName: z.string().max(60),
        goal: z.string().max(500),
        context: z.string().max(1000),
        experience: z.string().max(1000),
        workStudy: z.string().max(1000),
        weeklyAvailability: z.string().max(1000),
        interests: z.string().max(500),
        hobbies: z.string().max(500),
        preferences: z.string().max(500),
        currentProjects: z.string().max(1000),
        dailyMinutes: z.number().int().min(10).max(120),
      })
      .strict(),
  })
  .strict();
export type OnboardingReview = z.infer<typeof reviewSnapshotSchema>;
export function emptyOnboarding(): OnboardingState {
  return {
    version: 1,
    phase: "collecting",
    fields: Object.fromEntries(
      onboardingKeys.map((key) => [
        key,
        { status: "unknown", value: "", evidence: "" },
      ]),
    ) as OnboardingState["fields"],
  };
}
export function readOnboardingState(value: unknown): OnboardingState {
  const parsed = stateSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyOnboarding();
}
const required = new Set<OnboardingKey>(["displayName", "goal"]);
export function missingOnboarding(state: OnboardingState) {
  return onboardingKeys.filter(
    (key) =>
      state.fields[key].status === "unknown" ||
      (required.has(key) &&
        (state.fields[key].status !== "provided" ||
          !state.fields[key].value.trim())),
  );
}
export function reviewOnboarding(state: OnboardingState): OnboardingReview {
  const missing = missingOnboarding(state);
  const text = Object.fromEntries(
    profileTextFields.map(({ key }) => [
      key,
      state.fields[key].status === "provided" ? state.fields[key].value : "",
    ]),
  );
  return reviewSnapshotSchema.parse({
    ready: state.phase === "review" && missing.length === 0,
    missing,
    skipped: onboardingKeys.filter(
      (key) => state.fields[key].status === "skipped",
    ),
    candidate: {
      ...text,
      dailyMinutes:
        state.fields.dailyMinutes.status === "provided"
          ? Number(state.fields.dailyMinutes.value)
          : 25,
    },
  });
}
export function applyOnboardingAction(
  previous: OnboardingState,
  input: unknown,
  userStatements: string[],
) {
  const action = onboardingActionSchema.parse(input),
    state = structuredClone(previous),
    seen = new Set<OnboardingKey>();
  state.phase = "collecting";
  for (const update of action.updates) {
    if (seen.has(update.field)) throw new Error("Duplicate onboarding field");
    seen.add(update.field);
    if (
      !userStatements.some((statement) => statement.includes(update.evidence))
    )
      throw new Error("Ungrounded onboarding fact");
    if (update.status === "skipped") {
      if (required.has(update.field) || update.value !== "")
        throw new Error("Required onboarding field skipped");
    } else {
      if (!update.value.trim()) throw new Error("Empty onboarding fact");
      const limit =
        profileTextFields.find((f) => f.key === update.field)?.limit ?? 3;
      if (update.value.trim().length > limit)
        throw new Error("Onboarding field too long");
      if (
        update.field === "dailyMinutes" &&
        (!/^\d+$/.test(update.value) ||
          Number(update.value) < 10 ||
          Number(update.value) > 120)
      )
        throw new Error("Invalid session length");
    }
    state.fields[update.field] = {
      status: update.status,
      value: update.value.trim(),
      evidence: update.evidence,
    };
  }
  return { state, reply: action.reply, review: reviewOnboarding(state) };
}
const actionParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: {
      type: "string",
      description:
        "Короткий ответ по-русски и один следующий вопрос; при finish предложи проверить итог. Не утверждай, что профиль сохранён.",
    },
    updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: { type: "string", enum: onboardingKeys },
          status: { type: "string", enum: ["provided", "skipped"] },
          value: {
            type: "string",
            description:
              "Факт по словам пользователя; dailyMinutes — целое 10–120 строкой. Для skipped пустая строка.",
          },
          evidence: {
            type: "string",
            description:
              "Точная непустая цитата пользователя: источник факта или явного отказа от темы.",
          },
        },
        required: ["field", "status", "value", "evidence"],
      },
    },
  },
  required: ["reply", "updates"],
};
export const onboardingTools = [
  {
    type: "function",
    name: "record_onboarding",
    description:
      "Обновить неподтверждённый черновик и продолжить знакомство, если ещё есть неизвестные темы.",
    strict: true,
    parameters: actionParameters,
  },
  {
    type: "function",
    name: "finish_onboarding",
    description:
      "Предложить итог на проверку, если известны имя и цель, а остальные темы раскрыты или явно пропущены. Не сохраняет профиль и не открывает dashboard.",
    strict: true,
    parameters: actionParameters,
  },
];
