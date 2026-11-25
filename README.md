## Отправка писем с сайта

Сайт отправляет записки через веб-приложение Google Apps Script. В `.env.production` нужен **deployment URL** вида `https://script.google.com/macros/s/AKfycb…/exec`, а не `script ID` из адреса редактора. Сейчас рабочий адрес — `https://script.google.com/macros/s/AKfycbzUANoHjOxe_lr4MQ6djBHZmN5gloe46WOOE7m_QWEDJM1dmlI7Vqt9orfZVCbtg13CsQ/exec`.

После изменений `gas/Code.gs` нужно в редакторе скрипта сделать **Развёртывания → изменить → Версия: новая версия → Развернуть**. Просто сохранить код достаточно только для тестов внутри редактора: сайт продолжает вызывать ту версию, которая привязана к deployment URL. Проверять ответ можно запросом `POST` с телом `{"issue":"token"}`: ожидается `HTTP 200` и JSON с полем `token`.

В свойствах скрипта должны быть `TURNSTILE_SECRET` (секрет Cloudflare) и `FORM_SECRET` (создаётся скриптом при первом запуске). Ключ сайта задаётся в `VITE_TURNSTILE_SITE_KEY`, домен сайта должен быть разрешён в настройках Turnstile.

## Бот выпуска

GitHub Action `.github/workflows/telegram-poll.yml` каждые 15 минут проверяет Telegram. Если редактор прислал PDF, Action записывает `public/data/issue.pdf`, коммитит его в `main` и заново публикует сайт. Пока новых сообщений нет, сборка не запускается.

Выпуск отправляется как файл PDF, не как фото. Размер не больше 20 МБ. Новый файл заменяет `public/data/issue.pdf`.

По умолчанию бот пишет в `probuzhdenie/probuzhdenie.github.io`, ветка `main`. Другой репозиторий задаётся переменной `GITHUB_REPO`.

Бот отвечает, когда PDF записан. Перед записью он поворачивает страницы по тексту, и сайт рисует файл уже без этой проверки.
