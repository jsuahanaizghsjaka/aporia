# Roadmap MVP

Правило: **рабочий вертикальный цикл → качество → дополнительные функции**.

## 0. Product foundation

- [x] Пользователь, проблема, решение и ценность зафиксированы.
- [x] Границы MVP зафиксированы.
- [x] GitHub-репозиторий создан.

## 1. Skeleton

- [x] Next.js, TypeScript, Tailwind и ESLint.
- [x] shadcn/ui.
- [x] Структура components, AI, DB, auth, types и prompts.
- [x] Общий layout: sidebar, topbar, main content.
- [x] Маршруты `/login`, `/signup`, `/onboarding`, `/dashboard`, `/profile`, `/diagnostic`, `/roadmap`, `/learn`, `/projects`, `/progress`.

## 2. Data и auth

- [ ] Supabase и шаблон переменных окружения.
- [ ] Browser/server clients, profiles и RLS.
- [ ] Signup, login, logout, protected routes и redirects.

## 3. AI помнит пользователя

- [ ] Meet your mentor и chat UI.
- [ ] Onboarding state machine.
- [ ] Streaming AI с обработкой ошибок.
- [ ] Structured profile extraction, подтверждение и редактирование.
- [ ] Повторный вход с сохранённой памятью.

## 4. Learning system

- [ ] Goal, diagnostic и фиксированное skill tree.
- [ ] Mastery, confidence и evidence.
- [ ] Roadmap, dashboard и Today's Mission.
- [ ] Learning sessions, Learn/Help и Teaching Policy.
- [ ] Exercises и project mentor.

## 5. Personalization и release

- [ ] Progress, history и spaced repetition.
- [ ] Resources, feedback и weekly review.
- [ ] Analytics, error/empty states и landing.
- [ ] Vercel, production QA, alpha, feature freeze и beta.

## Следующий шаг

Подключить Supabase, создать profiles и настроить аутентификацию.
