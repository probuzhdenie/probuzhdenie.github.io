# esvetvisit

Сайт храма публикуется из репозитория `probuzhdenie/probuzhdenie.github.io`. Пуш в `main` заново собирает страницу и выкладывает её на https://probuzhdenie.github.io/.

Текущий выпуск — файл `public/data/issue.pdf`. Его записывает Telegram-бот из папки `bot/`. На сайте он доступен как `data/issue.pdf`: Vite копирует содержимое `public/` в корень сборки.

## Бот выпуска

Компьютер для бота не нужен. GitHub Action `.github/workflows/telegram-poll.yml` каждые 15 минут проверяет Telegram. Если редактор прислал PDF, Action записывает `public/data/issue.pdf`, коммитит его в `main` и заново публикует сайт. Пока новых сообщений нет, сборка не запускается.

В настройках репозитория `probuzhdenie/probuzhdenie.github.io` добавьте секрет `TELEGRAM_BOT_TOKEN` (Settings → Secrets and variables → Actions). Секрет `TELEGRAM_EDITOR_CODE` — код, который бот спрашивает у нового человека. После верного кода этот чат запоминается. Пока секрета нет, сообщение примет любой чат. Необязательная переменная `TELEGRAM_ALLOWED_CHAT_IDS` по-прежнему пропускает перечисленные чаты без кода.

GitHub иногда запускает расписание на несколько минут позже. Номер последнего проверенного сообщения хранится в `bot/state.json`, чтобы одно и то же сообщение не публиковалось дважды.

Выпуск отправляется как файл PDF, не как фото. Размер не больше 20 МБ. Новый файл заменяет `public/data/issue.pdf`.

Локальный запуск тем же кодом, если нужно проверить бота у себя: Node.js 18 или новее, отдельные пакеты не нужны.

```bash
cd bot
set TELEGRAM_BOT_TOKEN=your-bot-token
set GITHUB_TOKEN=github-token-with-contents-write
npm start
```

По умолчанию бот пишет в `probuzhdenie/probuzhdenie.github.io`, ветка `main`. Другой репозиторий задаётся переменной `GITHUB_REPO`.

Токен GitHub — fine-grained, только этот репозиторий, право Contents: Read and write. Секреты читаются из окружения. Не коммитьте их.

В группе режим приватности BotFather скрывает обычные сообщения. Отключите его через `/setprivacy` или пишите боту в личный чат.

`/chatid` отвечает идентификатором чата для `TELEGRAM_ALLOWED_CHAT_IDS`. Если переменная пустая, бот принимает выпуск из любого чата.

Бот отвечает, когда PDF записан. Страницы показываются как есть: вёрстка остаётся той, что в файле.
