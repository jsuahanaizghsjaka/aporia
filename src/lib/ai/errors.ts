export type AIErrorCode =
  | "AI_TIMEOUT"
  | "AI_RATE_LIMIT"
  | "AI_QUOTA"
  | "AI_ACCESS"
  | "AI_UNAVAILABLE"
  | "AI_NOT_CONFIGURED"
  | "AI_INVALID_RESPONSE"
  | "AI_CANCELLED"
  | "AI_MEMORY";
export class AIError extends Error {
  code: AIErrorCode;
  retryAfter?: number;
  constructor(code: AIErrorCode, retryAfter?: number) {
    super(code);
    this.name = "AIError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
export function isAIQuotaCode(code: unknown) {
  return (
    typeof code === "string" &&
    [
      "insufficient_quota",
      "credit_balance_exhausted",
      "billing_hard_limit_reached",
      "organization_usage_limit_reached",
      "organization_spend_limit_exceeded",
      "project_spend_limit_exceeded",
    ].includes(code)
  );
}
export function retryAfterSeconds(value: string | null, now = Date.now()) {
  if (!value?.trim()) return undefined;
  const seconds = /^\d+(\.\d+)?$/.test(value.trim())
    ? Number(value)
    : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(86400, Math.max(1, Math.ceil(seconds)))
    : undefined;
}
export function publicAIError(cause: unknown) {
  const error =
    cause instanceof AIError ? cause : new AIError("AI_UNAVAILABLE");
  const details = {
    AI_TIMEOUT: [504, true, "Ментор не успел ответить. Повтори отправку."],
    AI_RATE_LIMIT: [
      429,
      true,
      "Слишком много запросов. Подожди немного и повтори отправку.",
    ],
    AI_QUOTA: [
      503,
      false,
      "Лимит сервиса AI исчерпан. Владелец приложения должен проверить оплату и лимиты.",
    ],
    AI_ACCESS: [
      503,
      false,
      "Сервис AI недоступен. Владелец приложения должен проверить настройки модели и доступа.",
    ],
    AI_NOT_CONFIGURED: [
      503,
      false,
      "Ментор пока не подключён. Проверь подключение после настройки приложения.",
    ],
    AI_UNAVAILABLE: [
      503,
      true,
      "Ментор временно недоступен. Повтори отправку.",
    ],
    AI_INVALID_RESPONSE: [
      502,
      true,
      "Ответ прервался или оказался некорректным. Повтори отправку.",
    ],
    AI_CANCELLED: [408, true, "Ответ остановлен. Можно повторить отправку."],
    AI_MEMORY: [
      503,
      true,
      "Ответ не сохранился. Повтори отправку — твоё сообщение останется в истории.",
    ],
  } as const;
  const [status, retryable, message] = details[error.code];
  return {
    status,
    error: message,
    code: error.code,
    retryable,
    retryAfter: error.retryAfter,
  };
}
