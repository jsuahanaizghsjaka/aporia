# Aporia: от обновления папки до первого запуска

Рабочая папка одна: C:\Users\Sinon\OneDrive\Рабочий стол\Aporia.
Все команды ниже выполняются в PowerShell. Git Bash для этой инструкции не нужен. Commit, push и смена ветки не выполняются. Windows-папка не синхронизируется с рабочей средой ChatGPT автоматически: один раз перенеси пакет по этой инструкции.

## Что означают этапы проекта

| Этап | Содержание                                            | Текущий статус                                       |
| ---- | ----------------------------------------------------- | ---------------------------------------------------- |
| 1    | Каркас, дизайн, навигация и профиль с аватаром        | Код подготовлен                                      |
| 2    | Supabase, аккаунты, таблицы и права доступа           | Код подготовлен, нужна настройка сервиса             |
| 3    | Знакомство, подтверждение профиля, AI и память        | Код подготовлен, нужен настоящий AI и проверка входа |
| 4    | Диагностика, задания, подсказки и проект              | Локально проверено                                   |
| 5    | Прогресс, повторения, отзывы и недельный обзор        | Локально проверено; внешний запуск впереди           |
| 6    | Сохранение и конфликты вкладок                        | Локально проверено; нужна третья миграция в Supabase |
| 7    | Проверки учебного цикла, фото и мобильного интерфейса | Локально проверено                                   |
| 8    | Обновление Windows, окружение и готовность запуска    | Инструменты готовы; выполнить на твоём компьютере    |
| 9    | Настоящие аккаунты, AI, Storage и облачная память     | План; ещё не выполнено                               |
| 10   | Размещение, alpha 3–5 и затем beta 10–20              | План; ещё не выполнено                               |

Этапы 9–10 добавлены сейчас по запросу пользователя: это выделенные оставшиеся задачи внешней проверки и выпуска из этапов 5–8. Они не означают, что появился новый учебный трек или что релиз уже состоялся. Код этапов 1–7 заново вручную писать не требуется.

## 1. Подготовить текущую папку

Сохрани открытые файлы. Останови сервер Aporia через Ctrl+C в его терминале, закрой VS Code на время замены зависимостей. Если OneDrive блокировал файлы, приостанови синхронизацию на время обновления. Завершать все Node-процессы на компьютере не нужно.

Открой обычный PowerShell, права администратора не нужны:

```powershell
Set-Location "$HOME\OneDrive\Рабочий стол\Aporia"
node --version
npm.cmd --version
```

Проект требует Node.js 22.18 или новее. Если проверка версии не проходит, сначала установи поддерживаемую Node.js с https://nodejs.org/ и открой новый PowerShell.

## 2. Скачать и применить обновление

Скачай **новый** архив aporia-windows-ready.zip из ответа в папку «Загрузки». Старый aporia-desktop-update.zip больше не используй: в нём старый установщик. Вручную распаковывать новый архив не требуется.

Вставь весь блок в PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
Set-ExecutionPolicy -Scope Process Bypass -Force

$aporiaProject = Join-Path $HOME 'OneDrive\Рабочий стол\Aporia'
Set-Location -LiteralPath $aporiaProject
if (-not (Test-Path -LiteralPath '.git')) { throw 'Existing Aporia Git project not found.' }

$aporiaArchive = Get-ChildItem -LiteralPath (Join-Path $HOME 'Downloads') -Filter 'aporia-windows-ready*.zip' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $aporiaArchive) { throw 'Download aporia-windows-ready.zip to Downloads first.' }

$aporiaStage = Join-Path $aporiaProject ('.aporia-update\' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $aporiaArchive.FullName -DestinationPath $aporiaStage
$aporiaInstaller = Join-Path $aporiaStage 'Aporia\scripts\update-windows.ps1'
& $aporiaInstaller -ProjectPath $aporiaProject
Remove-Item -LiteralPath $aporiaStage -Recurse -Force
```

Установщик временно распаковывается внутри существующей Aporia. Вторая рабочая копия на рабочем столе или в Downloads не создаётся. Старые замещаемые исходники сохраняются в ZIP внутри .aporia-backups; это резервная копия, которую не надо открывать как проект. Резервные копии и временные файлы исключены из Git и Vercel.

Установщик сохраняет .git и локальные env-файлы, заменяет исходники, убирает конкретные старые служебные файлы, пересоздаёт node_modules и .next, затем выполняет npm ci и npm run verify. Он останавливается при ошибке; строка **UPDATE VERIFIED** появляется только после успешных команд. На Windows этот обновлённый установщик в рабочей среде ChatGPT не запускался.

Если появился EBUSY или «Cannot remove»: останови сервер именно Aporia, проверь паузу OneDrive, закрой программы, открывшие файлы проекта, и повтори блок. Если зависший процесс указан установщиком, заверши именно этот процесс в Диспетчере задач. Не запускай dev, пока npm ci не завершился успешно.

## 3. Посмотреть результат

После **UPDATE VERIFIED**:

```powershell
Set-Location "$HOME\OneDrive\Рабочий стол\Aporia"
npm.cmd pkg get scripts.dev scripts.verify scripts.doctor
npm.cmd run dev
```

Должны быть доступны dev через node scripts/dev.mjs, verify и doctor. Открой http://localhost:3000/preview. Если Next.js указал другой порт, используй его. Терминал с сервером оставь открытым.

Если снова 404: сначала проверь наличие src\app\preview\[[...screen]]\page.tsx и значение scripts.dev. При старом next dev обновление не применилось. Убедись, что браузер обращается к порту именно нового сервера Aporia.

## 4. Проверить предыдущие этапы 1–7

В /preview пройди знакомство, сохрани профиль, выбери фото и кадрирование, обнови страницу. Пройди диагностику и одно занятие с подсказкой. Сохрани проектный черновик, закрой вкладку и вернись. Проверь историю, прогресс, повторения и меню в узком окне.

Это локальная демонстрация: профиль и фото остаются в браузере, AI не вызывается. Автоматического переноса этих результатов в будущий аккаунт нет. После этого проверь полноценные аккаунты по следующим пунктам.

## 5. Этап 8: заполнить окружение

Останови dev через Ctrl+C. Создай env-файл, только если его ещё нет:

```powershell
Set-Location "$HOME\OneDrive\Рабочий стол\Aporia"
if (-not (Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
notepad.exe .env.local
```

В [Supabase Dashboard](https://supabase.com/dashboard) создай или выбери проект Aporia. В Connect возьми URL и publishable key; secret key находится в Settings → API Keys. Публичный ключ используется в браузере, secret только на сервере. [Инструкция Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

Заполни пять строк собственными значениями, затем сохрани файл:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SECRET_KEY
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=YOUR_MODEL_ID
```

Заглушки YOUR_... оставлять нельзя. Ключ OpenAI создаётся в твоём API-проекте; выбери доступную модель с Responses API, streaming и Structured Outputs. В проекте уже есть интеграция, устанавливать SDK вручную не требуется. [Настройка OpenAI API](https://developers.openai.com/api/docs/quickstart). Настоящая генерация использует API-бюджет.

Ключи вводи только локально и в настройках окружения хостинга; содержимое .env.local в чат не присылай.

## 6. Этап 8: создать таблицы и настроить вход

В VS Code открой supabase/migrations. Для нового пустого Supabase-проекта по очереди скопируй весь текст каждого файла в SQL Editor → New query → Run:

1. 202609080001_profiles_and_memory.sql
2. 202609080002_learning_loop.sql
3. 202609080003_profile_versions.sql

После каждого запуска дождись успеха. Если миграции уже применялись, выполни только недостающие по порядку. Если не знаешь, какие выполнены, сначала проверь историю запросов и схему; не запускай первую поверх существующих таблиц вслепую.

В Supabase Authentication включи Email/password и подтверждение email. В URL Configuration укажи Site URL http://localhost:3000, в Redirect URLs добавь http://localhost:3000/auth/callback. [Правила redirect URL](https://supabase.com/docs/guides/auth/redirect-urls).

Для писем реальным пользователям настрой Custom SMTP: стандартная отправка Supabase ограничена и рассчитана на тестирование, а не свободную регистрацию внешних пользователей. [Настройка SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 7. Этап 8: проверить подключение

Из той же папки:

```powershell
npm.cmd run doctor
if ($LASTEXITCODE -ne 0) { throw 'Fix the environment checks before continuing.' }

npm.cmd run doctor -- --live
if ($LASTEXITCODE -ne 0) { throw 'Fix the live checks before continuing.' }

npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

npm.cmd run start
```

doctor --live проверяет чтением конфигурацию, доступ к сервисам и схему, но не доказывает успешный вход, загрузку фото или генерацию AI. verify намеренно собирает приложение без реальных ключей: после него для настоящего аккаунта всегда нужна отдельная сборка с заполненным env.

## 8. Этап 9: проверить настоящий учебный цикл

Открой http://localhost:3000/signup. Зарегистрируй аккаунт A, подтверди email, войди. Дальше:

1. Пройди настоящее знакомство с AI, исправь и подтверди профиль.
2. Загрузи фото, сохрани, выйди и снова войди: профиль и фото должны восстановиться.
3. Пройди диагностику, одно Learn-занятие, сохрани код проекта и запроси AI-разбор.
4. Прерви занятие закрытием вкладки и продолжи после входа.
5. В двух вкладках отредактируй один профиль: устаревшее сохранение должно показать конфликт и сохранить текст в форме.
6. В приватном окне зарегистрируй аккаунт B: он не должен видеть профиль, фото, диалоги и учебную историю A.
7. Проверь экраны на телефоне после размещения по HTTPS; до размещения можно проверить узкое окно на компьютере.

Подробный технический прогон, включая прямые API/RLS проверки, находится в docs/RELEASE.md. Только открытие двух аккаунтов не доказывает изоляцию всех API. Этап 9 закрывается после полного прогона и исправления найденных дефектов.

## 9. Этап 10: разместить сайт без commit/push

Это отдельное действие после успешного этапа 9. Исходники остаются в той же Windows-папке, а Vercel размещает работающий сайт. Для публикации через CLI GitHub push не нужен. [Vercel deploy](https://vercel.com/docs/cli/deploy).

Предлагаемая цель — проект aporia в твоём выбранном аккаунте/команде Vercel. Не выбирай существующий посторонний проект. Главная, login и demo будут доступны в зависимости от защиты deployment; личные страницы требуют входа.

Из корня Aporia последовательно:

```powershell
npx.cmd vercel@latest login
npx.cmd vercel@latest link
```

При link выбери свой аккаунт/команду и проект Aporia, либо создай его. Root Directory — текущая папка, framework — Next.js. Это создаст только служебную связь .vercel в той же папке.

В панели этого проекта Vercel → Settings → Environment Variables добавь пять переменных из .env.local для Preview и Production. Они не переносятся автоматически из локального env. [Переменные окружения Vercel](https://vercel.com/docs/environment-variables).

Когда локальный внешний QA пройден и готов открыть сайт, выполни публикацию:

```powershell
npx.cmd vercel@latest deploy --prod
```

Эта команда создаёт production deployment. Главная и демонстрация будут доступны внешним посетителям согласно настройкам Deployment Protection; проверь эти настройки до отправки ссылки. Первый deployment нового проекта Vercel также может быть production при вызове без --prod: отсутствие этого флага не обещает приватный предпросмотр. [Поведение Vercel CLI](https://vercel.com/docs/cli/deploy).

Установи Supabase Site URL в окончательный HTTPS-адрес, добавь этот же адрес с /auth/callback в Redirect URLs, сохрани локальный callback для разработки. Повтори контрольный вход, AI, фото и учебное действие по опубликованной ссылке. Сохрани URL и deployment ID в release-записи. Команды Vercel публикуют приложение, но не делают Git commit/push.

## 10. Этап 10: alpha → исправления → beta

Сначала дай доступ 3–5 согласившимся студентам/джунам. Каждый проходит знакомство, диагностику, первое занятие и возвращается позже. Собери проблемы: где потерялся, что не сохранилось, насколько понятен следующий шаг. Форма есть в .github/ISSUE_TEMPLATE/alpha-feedback.yml.

До расширения аудитории исправь потерю данных, доступ к чужому аккаунту, неверные оценки, проблемы входа, фото и AI. Затем зафиксируй объём функций и расширь тестирование до 10–20 человек. Контролируй реальный расход AI и завершение учебного цикла. Alpha и beta не считаются выполненными, пока люди действительно не прошли их.

Повседневная работа: открывай в VS Code только папку Aporia рабочего стола; запускай npm run dev. npm ci повторно нужен после изменений зависимостей, а не перед каждым запуском. Commit/push остаются исключены из этой инструкции.
