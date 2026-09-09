import { z } from "zod";

export const profileSchema = z
  .object({
    displayName: z.string().trim().max(60).default(""),
    goal: z.string().trim().max(500).default(""),
    context: z.string().trim().max(1000).default(""),
    experience: z.string().trim().max(1000).default(""),
    interests: z.string().trim().max(500).default(""),
    preferences: z.string().trim().max(500).default(""),
    dailyMinutes: z.number().int().min(10).max(120).default(25),
    avatarPreset: z
      .enum(["rune", "stones", "orbit", "initials"])
      .default("rune"),
    avatarColor: z.enum(["violet", "mint", "rose", "blue"]).default("violet"),
    avatarShape: z.enum(["circle", "rounded"]).default("circle"),
    avatarPath: z.string().max(250).nullable().default(null),
    onboardingComplete: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.onboardingComplete && (!value.displayName || !value.goal))
      context.addIssue({
        code: "custom",
        path: ["goal"],
        message: "Для завершения знакомства укажи имя и цель.",
      });
  });
export type LearnerProfile = z.infer<typeof profileSchema>;
export type ProfileView = LearnerProfile & {
  avatarUrl: string | null;
  version?: number;
};
export const emptyProfile: ProfileView = {
  ...profileSchema.parse({}),
  avatarUrl: null,
  version: 0,
};
export const avatarTypes = ["image/jpeg", "image/png", "image/webp"];
export const maxAvatarBytes = 5 * 1024 * 1024;

export function validateAvatar(file: Pick<File, "size" | "type">) {
  if (!avatarTypes.includes(file.type))
    return "Выбери фото в формате JPG, PNG или WebP.";
  if (file.size > maxAvatarBytes) return "Фото должно быть не больше 5 МБ.";
  if (!file.size) return "Этот файл пуст. Выбери другое фото.";
  return null;
}
