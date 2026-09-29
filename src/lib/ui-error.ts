// Only deliberate, human-readable Russian application errors may reach UI.
// Browser exceptions, provider payloads and schema diagnostics use a safe fallback.
export function uiError(
  cause: unknown,
  fallback = "Не удалось выполнить действие. Проверь соединение и попробуй снова.",
) {
  const text = cause instanceof Error ? cause.message : "";
  return /^[А-ЯЁ]/u.test(text) &&
    text.length <= 500 &&
    !/[{}<>]|https?:|SQL|stack|token|api[_-]?key/i.test(text)
    ? text
    : fallback;
}
