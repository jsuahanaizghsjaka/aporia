# Этап 3 — авторизация

Источник: `MVP_AI_Mentor_Plan_September_2026.docx`, этап 3, шаги 3.1–3.6. Это не старый этап «AI помнит пользователя» из архивного roadmap.

## Реализация

| Шаг DOCX | Реализация | Проверка |
| --- | --- | --- |
| 3.1 Signup email/password | Валидация, нейтральное сообщение о письме, PKCE callback | Unit + HTTP с локальным Auth-сервисом |
| 3.2 Login | Проверенный Auth user, cookie-сессия, ошибки и rate limit | Unit + HTTP |
| 3.3 Logout | POST с проверкой Origin; при отказе провайдера нет ложного успеха | HTTP: выход, запрет GET/CSRF, отказ провайдера |
| 3.4 Приватные routes | Серверная проверка пользователя; отдельная защита API | HTTP: гость, вошедший, вышедший и два аккаунта |
| 3.5 Профиль при регистрации | Триггер на `auth.users` в той же транзакции | PostgreSQL/PGlite: trigger, rollback, backfill, права |
| 3.6 Переходы | Незавершённый профиль → onboarding; завершённый → dashboard | Unit + HTTP, повторный вход |

Ранее созданный аккаунт с незавершённым знакомством продолжает onboarding. Завершённый профиль не сбрасывается. Разрешённый `next` учитывается только после знакомства; внешние URL отклоняются. Ошибка чтения профиля не выдаётся за новый аккаунт и не создаёт цикл переадресаций. Cookie-ответы и обновление сессии в proxy не предназначены для общего кэширования. Секреты и подробности ошибок провайдера не возвращаются клиенту.

## Применение в единственной Windows-папке

Рабочая папка: `C:\Users\Sinon\OneDrive\Рабочий стол\Aporia`.

1. Остановить `npm run dev` через Ctrl+C. Скачать `aporia-stage3.patch` в «Загрузки».
2. В PowerShell из Aporia выполнить:

```powershell
& {
$ErrorActionPreference = 'Stop'
$stage3Patch = Join-Path $HOME 'Downloads\aporia-stage3.patch'
if (-not (Test-Path -LiteralPath $stage3Patch)) { throw 'Download aporia-stage3.patch first.' }
git apply --check --ignore-space-change --ignore-whitespace $stage3Patch
if ($LASTEXITCODE -ne 0) { throw 'Patch conflicts with local files. Stop and share the error.' }
git apply --ignore-space-change --ignore-whitespace $stage3Patch
if ($LASTEXITCODE -ne 0) { throw 'Patch was not applied.' }
npm run verify
if ($LASTEXITCODE -ne 0) { throw 'Verification failed. Stop and share the error.' }
}
```

Патч содержит только изменения этапа 3 относительно `f33236a`. Зависимости не менялись. Команды не выполняют commit, push, staging, удаление файлов или перенос проекта. `.env.local`, фотографии, база и `.git` не входят в патч. Выполнить блок целиком: при неудачном `--check` он остановится до изменений. При конфликте не применять `--reject`, reset или замену папки: сначала разобрать ошибку.

3. В SQL Editor своего Supabase выполнить **новую** миграцию `supabase/migrations/202609110004_auth_profiles.sql` после 001–003. Старые миграции заново не выполнять. Перед применением проверить выбранный проект и сделать резервную копию. Миграция добавляет trigger и недостающие профили, сохраняя существующие данные, аватары и версии. Она также выдаёт `service_role` SELECT, если изменение файла 001 ещё не попало в существующую базу. Уже применённую 004 не повторять.
4. В существующей `.env.local` нужны URL и публичный ключ Supabase. OpenAI и серверный ключ для самой авторизации не требуются. Проверить:

```powershell
npm run doctor -- --auth --live
npm run dev
```

Открыть `http://localhost:3000/signup` (или порт из терминала), не `/preview`: preview не проверяет Auth. Site URL и разрешённый callback в Supabase должны соответствовать адресу приложения: `http://localhost:3000/auth/callback`. Для production нужны отдельные точные HTTPS URL. Email/password должны быть включены; Confirm email и доставку писем настроить в Supabase.

## Критерий полного закрытия

`npm run verify` выполняет lint, unit/SQL-тесты, production build, HTTP-учебный цикл и новый `test:auth`. Последний запускает настоящее Next.js-приложение и **локальный тестовый сервис** Auth/PostgREST. Он не использует реальные ключи, не отправляет письма и не доказывает работоспособность удалённого Supabase. Перед verify остановить dev-сервер Aporia; auth-тест использует порт 3102 и завершается сам. Режим `doctor --auth --live` делает только GET настроек Auth, не проверяя триггер или регистрацию.

После миграции необходим ручной прогон:

- [ ] Зарегистрировать аккаунт A. В `profiles` сразу появилась одна строка с тем же id, пустыми `data`, `version=0`.
- [ ] До подтверждения email вход невозможен, если включён Confirm email. Письмо доставлено. Открыть ссылку в том же браузере регистрации: PKCE использует его cookie.
- [ ] После подтверждения открыт onboarding. Перезагрузка сохраняет вход.
- [ ] Выйти; приватный URL ведёт на login. Войти вновь — продолжить onboarding.
- [ ] Сохранить имя/цель через форму подтверждения профиля. Выйти и войти — dashboard с тем же профилем. AI не нужен для проверки Auth.
- [ ] Аккаунт B в отдельном профиле браузера видит только свои данные. Проверить RLS на двух id.
- [ ] Неверный пароль, испорченная/повторная ссылка, отказ сети показывают ошибку без ложного успеха. На телефоне форма доступна без горизонтальной прокрутки.

До этого прогона статус: **код реализован и локально проверен; облачная приёмка и браузерный QA не подтверждены**. В текущей среде Chromium отсутствует, его загрузка завершилась тайм-аутом. HTTP-проверка не заменяет клики и мобильную вёрстку.

Commit/push автоматически не выполняются. После успешного прогона на своём Supabase можно самостоятельно закоммитить исходники, миграцию, тесты и документацию через VS Code. `.env.local` и скачанный patch не включать. Следующий этап DOCX — 4, Lesson 0.

## Технические основания

Триггер следует [рекомендациям Supabase](https://supabase.com/docs/guides/auth/managing-user-data). Cookie-клиенты сверены с [руководством SSR Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs) и установленными библиотеками. Серверные проверки следуют локальному руководству `node_modules/next/dist/docs/01-app/02-guides/authentication.md`.
