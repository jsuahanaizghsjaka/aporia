import type { SkillId } from "./types.ts";
export const projects = [
  {
    id: "tasks",
    title: "Твой список дел",
    detail: "Личный API задач: создание, поиск, статусы и приватность.",
    entity: "задача",
    match: /задач|план|работ/iu,
  },
  {
    id: "music",
    title: "Музыкальная полка",
    detail: "API любимых треков: коллекции, поиск и личная библиотека.",
    entity: "трек",
    match: /музык|music|трек|песн/iu,
  },
  {
    id: "sport",
    title: "Дневник тренировок",
    detail: "API тренировок: упражнения, записи занятий и личный доступ.",
    entity: "тренировка",
    match: /спорт|sport|тренир|бег/iu,
  },
  {
    id: "books",
    title: "Книжные заметки",
    detail: "API прочитанных книг: заметки, фильтры и личная коллекция.",
    entity: "книга",
    match: /книг|чтен|book/iu,
  },
] as const;
export function suggestedProject(interests: string) {
  return (
    projects.find((project) => project.match.test(interests)) ?? projects[0]
  );
}
export const projectTasks: Record<
  SkillId,
  { title: string; brief: string; criteria: string[]; placeholder: string }
> = {
  python: {
    title: "Модель в памяти",
    brief:
      "Создай список записей с id и title. Напиши функции добавления и поиска по id; отсутствующая запись должна давать None.",
    criteria: [
      "Функции принимают данные аргументами",
      "Поиск отсутствующего id не падает",
      "Есть пример вызова",
    ],
    placeholder: "def find_record(records, record_id):\n    # твоя реализация",
  },
  git: {
    title: "История изменений",
    brief:
      "Создай отдельную ветку проекта и два осмысленных коммита. Добавь .gitignore для .env, .venv и __pycache__. Вставь команды и обезличенный git log --oneline.",
    criteria: [
      "Есть отдельная ветка",
      "Два коммита с понятными сообщениями",
      "Секреты исключены",
    ],
    placeholder: "git switch -c ...\n# команды и результат git log --oneline",
  },
  sql: {
    title: "Постоянное хранение",
    brief:
      "Опиши таблицы users и records, связь владельца, параметризованный запрос поиска. Покажи миграцию и пример вызова драйвера.",
    criteria: [
      "Первичные и внешние ключи",
      "Параметры вместо конкатенации SQL",
      "У каждой записи есть владелец",
    ],
    placeholder: "CREATE TABLE records (\n    ...\n);",
  },
  http: {
    title: "Контракт API",
    brief:
      "Опиши GET списка, POST создания, GET по id и DELETE. Для каждого укажи JSON и статусы успеха и ошибки.",
    criteria: [
      "Согласованные адреса ресурсов",
      "201 для создания, 404 при отсутствии",
      "GET не меняет состояние",
    ],
    placeholder: "POST /records\nЗапрос: ...\nОтвет 201: ...",
  },
  fastapi: {
    title: "Работающие обработчики",
    brief:
      "Реализуй контракт на FastAPI. Проверь title длиной 1–100 через Pydantic. Вставь обработчики и модели запросов.",
    criteria: [
      "Валидация тела до сохранения",
      "Нет неограниченного глобального хранилища в production",
      "HTTPException для отсутствующих записей",
    ],
    placeholder:
      "from fastapi import FastAPI, HTTPException\nfrom pydantic import BaseModel, Field\n\napp = FastAPI()",
  },
  auth: {
    title: "Личное остаётся личным",
    brief:
      "Добавь проверенную сессию и фильтр владельца в чтение, изменение и удаление. Не вставляй настоящие ключи или пароли.",
    criteria: [
      "Владелец берётся из проверенной сессии",
      "Чужие записи недоступны",
      "Секреты остаются на сервере",
    ],
    placeholder:
      "# зависимость текущего пользователя и запрос с фильтром владельца",
  },
  testing: {
    title: "Проверка поведения",
    brief:
      "Напиши pytest-тесты создания и повторного чтения, невалидного title, отсутствующей записи и попытки другого пользователя получить доступ.",
    criteria: [
      "Проверено сохранённое содержимое",
      "Есть два разных пользователя",
      "Тесты изолированы",
    ],
    placeholder: "def test_create_and_read(client):\n    ...",
  },
  docker: {
    title: "Воспроизводимый запуск",
    brief:
      "Добавь Dockerfile, .dockerignore и команды запуска с окружением. Опиши том PostgreSQL и шаг проверки /health.",
    criteria: [
      "Секреты не копируются в образ",
      "Данные вынесены в том",
      "README позволяет повторить запуск",
    ],
    placeholder:
      "FROM python:3.12-slim\n# зависимости, копирование кода, команда запуска",
  },
};
