import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, redactSecrets } from './config.js';
import { createGithub } from './github.js';
import {
  ISSUE_IMAGE_PATH,
  ISSUE_JSON_PATH,
  buildIssueDocument,
  createInbox,
  missingLabels,
  parseIssue,
} from './issue.js';
import { downloadPhoto, getUpdates, sendMessage } from './telegram.js';

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export function createApp({ config, github, send, download, now = () => Date.now(), log = console }) {
  const inbox = createInbox({ waitMs: config.waitMs, now });
  const timers = new Map();

  function redact(value) {
    return redactSecrets(value, [config.token, config.githubToken]);
  }

  function clearTimer(chatId) {
    const key = String(chatId);
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
  }

  function armTimer(chatId, delay = config.waitMs) {
    clearTimer(chatId);
    const key = String(chatId);
    const timer = setTimeout(() => {
      timers.delete(key);
      if (!inbox.expire(key, { force: true })) return;
      send(chatId, 'Время ожидания фото вышло. Пришлите текст выпуска ещё раз и затем фото.')
        .catch((err) => log.error(redact(err)));
    }, delay);
    timer.unref?.();
    timers.set(key, timer);
  }

  function keepPending(chatId, result) {
    if (result?.expiresAt == null || result.expiresAt < now()) return;
    inbox.restore(chatId, result.issue, result.expiresAt);
    armTimer(chatId, Math.max(1, result.expiresAt - now()));
  }

  function stop() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }

  async function handleUpdate(update) {
    const message = update.message || update.channel_post;
    if (!message?.chat || message.chat.id == null) return;

    const chatId = message.chat.id;
    const text = message.text || message.caption || '';
    const command = commandOf(text);

    if (command === '/chatid') {
      await send(chatId, `Идентификатор чата: ${chatId}`);
      return;
    }

    if (!isAllowed(config, chatId)) {
      const interesting = command === '/start'
        || command === '/help'
        || Boolean(message.photo)
        || parseIssue(text).recognized;
      if (interesting) await send(chatId, 'Этот чат не может публиковать выпуск.');
      return;
    }

    if (command === '/start' || command === '/help') {
      await send(chatId, helpText(config.waitMs));
      return;
    }

    const photo = largestPhoto(message);
    if (!photo && message.document) {
      if (parseIssue(text).recognized || inbox.hasPending(chatId)) {
        await send(chatId, 'Пришлите снимок как фото, не как файл.');
      }
      return;
    }

    if (photo?.file_size > MAX_PHOTO_BYTES) {
      await send(chatId, 'Фото больше 20 МБ. Пришлите снимок меньшего размера.');
      return;
    }

    // Decide before downloading. A slow download must not expire the text.
    const result = inbox.accept({ chatId, text, hasPhoto: Boolean(photo) });

    if (result.action === 'ignore') return;

    if (result.action === 'wait_photo') {
      armTimer(chatId);
      await send(chatId, `Текст принят. Пришлите одно фото следующим сообщением в течение ${waitPhrase(config.waitMs)}.`);
      return;
    }

    if (result.action === 'reject') {
      await send(chatId, rejectText(result));
      return;
    }

    clearTimer(chatId);

    let photoBytes;
    try {
      photoBytes = Buffer.from(await download(photo.file_id));
    } catch (err) {
      keepPending(chatId, result);
      await send(chatId, `Не удалось скачать фото: ${redact(err)}`);
      return;
    }
    if (photoBytes.length === 0) {
      keepPending(chatId, result);
      await send(chatId, 'Файл фото пустой.');
      return;
    }
    if (photoBytes.length > MAX_PHOTO_BYTES) {
      keepPending(chatId, result);
      await send(chatId, 'Фото больше 20 МБ. Пришлите снимок меньшего размера.');
      return;
    }

    await publish(chatId, result.issue, photoBytes);
  }

  async function publish(chatId, issue, photoBytes) {
    let photoUrl = null;
    try {
      const photoResult = await github.putFile({
        path: ISSUE_IMAGE_PATH,
        bytes: photoBytes,
        message: 'Publish issue photo',
      });
      photoUrl = photoResult.commitUrl;
      const updatedAt = new Date(now()).toISOString();
      const document = buildIssueDocument(issue, updatedAt);
      const jsonResult = await github.putFile({
        path: ISSUE_JSON_PATH,
        bytes: `${JSON.stringify(document, null, 2)}\n`,
        message: commitSubject(issue.headline),
      });
      log.info?.(`Published issue for chat ${chatId}: ${jsonResult.commitUrl || 'workspace'}`);
      const lines = ['Выпуск записан. Сайт обновится в течение нескольких минут.'];
      if (jsonResult.commitUrl) lines.push(`Текст: ${jsonResult.commitUrl}`);
      if (photoUrl) lines.push(`Фото: ${photoUrl}`);
      await send(chatId, lines.join('\n'));
    } catch (err) {
      log.error(redact(err));
      const photoNote = photoUrl ? `\nФото уже записано: ${photoUrl}` : '';
      await send(chatId, `Не удалось записать выпуск: ${redact(err)}${photoNote}`);
    }
  }

  function exportPending() {
    return inbox.snapshot();
  }

  function importPending(entries) {
    for (const entry of entries || []) {
      inbox.restore(entry.chatId, entry.issue, entry.expiresAt);
    }
  }

  return { handleUpdate, stop, exportPending, importPending };
}

export async function startBot(config = loadConfig(), deps = {}) {
  const fetchImpl = deps.fetchImpl;
  const github = createGithub({
    token: config.githubToken,
    repo: config.repo,
    branch: config.branch,
    fetchImpl,
  });
  const app = createApp({
    config,
    github,
    send: (chatId, text) => sendMessage({ token: config.token, chatId, text, fetchImpl }),
    download: (fileId) => downloadPhoto({ token: config.token, fileId, fetchImpl }),
    log: deps.log || console,
  });

  let offset = 0;
  let stopping = false;
  const onStop = () => {
    stopping = true;
    app.stop();
  };
  process.once('SIGINT', onStop);
  process.once('SIGTERM', onStop);

  const mode = config.allowlist
    ? `allowlist of ${config.allowlist.size}`
    : 'any chat (TELEGRAM_ALLOWED_CHAT_IDS is unset)';
  console.log(`Issue bot polling ${config.repo}@${config.branch}, ${mode}`);

  while (!stopping) {
    const controller = new AbortController();
    const kill = () => controller.abort();
    const watchdog = setTimeout(() => controller.abort(), 45_000);
    process.on('SIGINT', kill);
    process.on('SIGTERM', kill);
    try {
      const updates = await getUpdates({
        token: config.token,
        offset,
        timeout: 30,
        signal: controller.signal,
        fetchImpl,
      });
      for (const update of updates) {
        if (stopping) break;
        try {
          await app.handleUpdate(update);
        } catch (err) {
          console.error(redactSecrets(err, [config.token, config.githubToken]));
        }
        offset = update.update_id + 1;
      }
    } catch (err) {
      if (stopping) break;
      console.error(redactSecrets(err, [config.token, config.githubToken]));
      if (err.status === 401) process.exit(1);
      await sleep(err.status === 409 ? 5000 : 3000);
    } finally {
      clearTimeout(watchdog);
      process.removeListener('SIGINT', kill);
      process.removeListener('SIGTERM', kill);
    }
  }
}

function isAllowed(config, chatId) {
  if (!config.allowlist) return true;
  return config.allowlist.has(String(chatId));
}

function commandOf(text) {
  const first = String(text || '').trim().split(/\s+/, 1)[0] || '';
  const bare = first.split('@', 1)[0].toLowerCase();
  return bare.startsWith('/') ? bare : '';
}

function largestPhoto(message) {
  const sizes = message.photo;
  if (!Array.isArray(sizes) || sizes.length === 0) return null;
  return sizes[sizes.length - 1];
}

function waitPhrase(waitMs) {
  if (waitMs % 60_000 === 0) return `${waitMs / 60_000} мин.`;
  return `${Math.round(waitMs / 1000)} сек.`;
}

function helpText(waitMs) {
  return [
    'Пришлите выпуск одним текстом и одно фото.',
    'Фото можно прикрепить к тому же сообщению или прислать следующим.',
    `Окно ожидания фото: ${waitPhrase(waitMs)}.`,
    '',
    'Заголовок: ...',
    'Тема: ...',
    'Текст: ...',
  ].join('\n');
}

function rejectText(result) {
  if (result.reason === 'missing') {
    return `Не хватает полей: ${missingLabels(result.missing).join(', ')}.`;
  }
  if (result.reason === 'expired') {
    return 'Время ожидания фото вышло. Пришлите текст выпуска ещё раз и затем фото.';
  }
  return 'Сначала пришлите текст выпуска (заголовок, тема, текст) и одно фото.';
}

function commitSubject(headline) {
  const oneLine = String(headline).replace(/\s+/g, ' ').trim();
  const subject = `Publish issue: ${oneLine}`;
  return subject.length > 72 ? `${subject.slice(0, 71)}…` : subject;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isDirectRun = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  startBot().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
