// Compare the version the learner actually saw, not the latest value read when
// the request starts. Otherwise an answer from another tab can hit a new task.
export class PreviewConflict extends Error {
  constructor() {
    super(
      "Данные изменились в другой вкладке. Обнови данные и проверь задание перед повтором.",
    );
  }
}
export async function commitPreview<T>(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  expected: string | null,
  prepare: () => Promise<{ value: string; result: T }>,
) {
  if (storage.getItem(key) !== expected) throw new PreviewConflict();
  const prepared = await prepare();
  if (storage.getItem(key) !== expected) throw new PreviewConflict();
  try {
    storage.setItem(key, prepared.value);
  } catch {
    throw new Error(
      "Браузер не сохранил данные. Освободи место или разреши локальное хранение и повтори действие.",
    );
  }
  return prepared.result;
}

// An earlier read must never replace the result of a newer read or mutation.
export function createRequestOrder() {
  let generation = 0;
  return {
    next: () => ++generation,
    isCurrent: (ticket: number) => ticket === generation,
  };
}
