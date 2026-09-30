import { z } from "zod";

export const recoverySchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("request"),
    email: z.string().trim().pipe(z.email().max(254)),
  }),
  z
    .strictObject({
      action: z.literal("update"),
      password: z.string().min(8).max(128),
      confirmation: z.string().min(8).max(128),
    })
    .refine((v) => v.password === v.confirmation, "Пароли не совпадают."),
]);
export const recoveryMessage =
  "Запрос принят. Если аккаунт с этой почтой существует, ты получишь ссылку для смены пароля. Проверь «Спам» и открой последнее письмо в этом же браузере.";
