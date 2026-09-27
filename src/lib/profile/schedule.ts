import { z } from "zod";

export const scheduleSchema = z.object({
  timeZone: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Укажи часовой пояс, например Europe/Moscow."),
  days: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(120)
        .refine((n) => n === 0 || n >= 5, "Укажи 0 или от 5 до 120 минут."),
    )
    .length(7),
});
export type PersonalSchedule = z.infer<typeof scheduleSchema>;
export const dayNames = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
export function localDate(now: Date, timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function weekKey(now: Date, timeZone = "UTC") {
  const date = new Date(localDate(now, timeZone) + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function availableToday(
  profile: { dailyMinutes: number; schedule?: PersonalSchedule | null },
  now = new Date(),
) {
  if (!profile.schedule) return profile.dailyMinutes;
  const date = new Date(
    localDate(now, profile.schedule.timeZone) + "T00:00:00Z",
  );
  return profile.schedule.days[(date.getUTCDay() + 6) % 7];
}
