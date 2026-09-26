import type { Question, SkillId } from "./types.ts";

// Versioned deterministic templates: exact same id always reconstructs the same
// task AND server-only expected answer. Never persist answers in the public state.
export function generatedExercise(id: string): Question | null {
  const m =
    /^(python|git|sql|http|fastapi|auth|testing|docker)\.v1\.([123])\.([0-9]{1,2})$/.exec(
      id,
    );
  if (!m || Number(m[3]) > 19) return null;
  const skill = m[1] as SkillId,
    level = Number(m[2]),
    n = Number(m[3]) + 2;
  const q: Question = {
    id,
    skill,
    level: ["foundation", "practice", "challenge"][
      level - 1
    ] as Question["level"],
    prompt: "",
    answers: [],
    hints: ["", ""],
    explanation: "",
    partial: "",
    solution: "",
  };
  let answer = "",
    principle = "";
  switch (skill) {
    case "python":
      q.prompt = "Какое число напечатает Python?";
      q.code =
        level === 1
          ? `values = [${n}, ${n + 1}, ${n + 2}]\nprint(values[1])`
          : level === 2
            ? `values = [${n}, ${n + 1}, ${n + 2}]\nprint(sum(x for x in values if x % 2 == 0))`
            : `a = [${n}, ${n + 1}]\nb = a\nc = a.copy()\nb.append(${n + 2})\nprint(len(a) + len(c))`;
      answer = String(
        level === 1
          ? n + 1
          : level === 2
            ? [n, n + 1, n + 2]
                .filter((x) => x % 2 === 0)
                .reduce((a, b) => a + b, 0)
            : 5,
      );
      principle =
        level === 1
          ? "Индексация списка начинается с нуля."
          : level === 2
            ? "Фильтр выбирает чётные элементы, затем sum складывает их."
            : "b ссылается на a, а copy создаёт отдельный список.";
      break;
    case "git":
      q.prompt =
        level === 1
          ? `Создай ветку feature/record-${n} и переключись на неё одной командой git switch.`
          : level === 2
            ? `Добавь только файл record_${n}.py в индекс одной командой.`
            : `Отмени изменения коммита abc${n} новым коммитом, сохранив общую историю. Какая команда?`;
      answer =
        level === 1
          ? `git switch -c feature/record-${n}`
          : level === 2
            ? `git add record_${n}.py`
            : `git revert abc${n}`;
      principle =
        "switch -c создаёт ветку; add выбирает файлы; revert отменяет коммит новым коммитом без переписывания истории.";
      break;
    case "sql":
      q.prompt =
        "Запрос выполняется на таблице records. Какое число получится?";
      q.code =
        `-- id: ${n}, ${n + 1}, ${n + 2}\n` +
        (level === 1
          ? "SELECT COUNT(*) FROM records;"
          : level === 2
            ? `SELECT COUNT(*) FROM records WHERE id > ${n};`
            : `SELECT SUM(id) FROM records WHERE id >= ${n + 1};`);
      answer = String(level === 1 ? 3 : level === 2 ? 2 : 2 * n + 3);
      principle =
        "Сначала WHERE отбирает строки; COUNT считает строки, SUM складывает значения.";
      break;
    case "http":
      q.prompt =
        level === 1
          ? `POST /records создаёт запись ${n}. Какой стандартный статус обозначает создание?`
          : level === 2
            ? `GET /records/${n} ищет отсутствующую запись. Какой статус вернуть?`
            : `DELETE /records/${n} успешно выполнен. Тело ответа отсутствует. Какой статус соответствует No Content?`;
      answer = String(level === 1 ? 201 : level === 2 ? 404 : 204);
      principle = "Created — 201, Not Found — 404, No Content — 204.";
      break;
    case "fastapi":
      q.prompt = `Поле title задано как Field(min_length=${level}, max_length=${n + 3}). Какая строка пройдёт проверку длины?`;
      q.choices = ["", "a".repeat(level), "b".repeat(n + 4)].map((v) =>
        JSON.stringify(v),
      );
      answer = JSON.stringify("a".repeat(level));
      principle =
        "Границы min_length и max_length включены; строка короче минимума или длиннее максимума невалидна.";
      break;
    case "auth":
      q.prompt =
        level === 1
          ? `Запись ${n} приватная. Откуда брать user_id владельца при создании?`
          : level === 2
            ? `Пользователь A пытается читать запись ${n} пользователя B. Где проверять владельца?`
            : `PUT и DELETE /records/${n}: какая защита нужна помимо проверки сессии?`;
      answer =
        level === 1
          ? "Из проверенной сервером сессии"
          : level === 2
            ? "На сервере при обращении к данным"
            : "Фильтр владельца в обоих запросах";
      q.choices = [
        "Доверять user_id из тела запроса",
        answer,
        "Спрятать кнопку в интерфейсе",
      ];
      principle =
        "Сервер проверяет личность и права на конкретную запись при каждой операции.";
      break;
    case "testing":
      q.prompt =
        level === 1
          ? `POST создаёт запись ${n}. Какой тест подтверждает сохранение?`
          : level === 2
            ? `Как проверить, что запись ${n} не доступна другому пользователю?`
            : `Тесты записи ${n} проходят только после предыдущего теста. Что исправить?`;
      answer =
        level === 1
          ? "Создать, затем прочитать и сравнить данные"
          : level === 2
            ? "Запросить её из второй независимой сессии"
            : "Изолировать данные и подготовку каждого теста";
      q.choices = [
        answer,
        "Проверить только наличие кнопки",
        "Всегда подставлять успешный ответ",
      ];
      principle =
        "Тест проверяет наблюдаемое поведение, изоляцию пользователей и независимость начальных данных.";
      break;
    case "docker":
      q.prompt =
        level === 1
          ? `В -p ${8000 + n}:8000 какой порт открыт на хосте?`
          : level === 2
            ? `В -p 9000:${8000 + n} на каком порту приложение слушает внутри контейнера?`
            : `Сервис слушает внутри контейнера на ${8000 + n}. Хосту нужен порт 9000. Напиши только значение для -p.`;
      answer = level === 3 ? `9000:${8000 + n}` : String(8000 + n);
      principle =
        "Публикация порта задаётся как хост:контейнер; процесс должен слушать порт внутри контейнера.";
      break;
  }
  q.answers = [answer];
  q.hints = ["Выдели входные данные и то, что именно спрашивается.", principle];
  q.explanation = principle;
  q.partial = `Применим правило: ${principle}`;
  q.solution = `${answer}\n\n${principle}`;
  return q;
}
