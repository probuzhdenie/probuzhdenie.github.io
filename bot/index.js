import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, redactSecrets } from './config.js';
import { createGithub } from './github.js';
import { ISSUE_PDF_PATH, createInbox } from './issue.js';
import { downloadPhoto, getUpdates, sendMessage } from './telegram.js';

const MAX_PDF_BYTES = 20 * 1024 * 1024;

const MAX_CODE_ATTEMPTS = 8;

export function createApp({ config, github, send, download, now = () => Date.now(), log = console }) {
  const inbox = createInbox({ waitMs: config.waitMs, now });
  const timers = new Map();
  const editors = new Set();
  const denials = new Map();

  function redact(value) {
    return redactSecrets(value, [config.token, config.githubToken, config.editorCode]);
  }

  function isEditor(chatId) {
    const key = String(chatId);
    if (editors.has(key)) return true;
    if (!config.editorCode) return isAllowed(config, chatId);
    return Boolean(config.allowlist?.has(key));
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

    if (config.editorCode && !isEditor(chatId)) {
      if (foreignFile(message)) await refuseFile(chatId);
      await answerAccess(chatId, text);
      return;
    }

    if (!isAllowed(config, chatId)) {
      const interesting = command === '/start'
        || command === '/help'
        || Boolean(message.document);
      if (interesting) await send(chatId, 'Этот чат не может публиковать выпуск.');
      return;
    }

    if (command === '/start' || command === '/help') {
      await send(chatId, helpText());
      return;
    }

    const file = pdfDocument(message);
    if (foreignFile(message)) {
      await refuseFile(chatId);
      return;
    }
    if (!file) return;

    if (file.file_size > MAX_PDF_BYTES) {
      await send(chatId, 'PDF больше 20 МБ. Пришлите файл меньшего размера.');
      return;
    }

    let pdfBytes;
    try {
      pdfBytes = Buffer.from(await download(file.file_id));
    } catch (err) {
      await send(chatId, `Не удалось скачать PDF: ${redact(err)}`);
      return;
    }
    if (pdfBytes.length === 0) {
      await send(chatId, 'Файл PDF пустой.');
      return;
    }
    if (pdfBytes.length > MAX_PDF_BYTES) {
      await send(chatId, 'PDF больше 20 МБ. Пришлите файл меньшего размера.');
      return;
    }
    if (!isPdf(pdfBytes)) {
      await send(chatId, 'Это не PDF. Пришлите выпуск файлом PDF.');
      return;
    }

    await publish(chatId, pdfBytes);
  }

  async function refuseFile(chatId) {
    log.info?.(`Chat ${chatId}: refused a file that is not a PDF`);
    await send(chatId, 'Пришлите выпуск файлом PDF.');
  }

  async function publish(chatId, pdfBytes) {
    try {
      const result = await github.putFile({
        path: ISSUE_PDF_PATH,
        bytes: pdfBytes,
        message: 'Publish newspaper PDF',
      });
      log.info?.(`Published PDF for chat ${chatId}: ${result.commitUrl || 'workspace'}`);
      const lines = ['Выпуск записан. Сайт обновится в течение нескольких минут.'];
      if (result.commitUrl) lines.push(result.commitUrl);
      await send(chatId, lines.join('\n'));
    } catch (err) {
      log.error(redact(err));
      await send(chatId, `Не удалось записать выпуск: ${redact(err)}`);
    }
  }

  async function answerAccess(chatId, text) {
    const key = String(chatId);
    const fails = denials.get(key) || 0;
    if (fails >= MAX_CODE_ATTEMPTS) {
      await send(chatId, 'Слишком много неверных попыток.');
      return;
    }
    const attempt = String(text || '').trim();
    if (attempt && safeEqual(attempt, config.editorCode)) {
      editors.add(key);
      denials.delete(key);
      await send(chatId, `Доступ открыт.\n\n${helpText()}`);
      return;
    }
    if (attempt) denials.set(key, fails + 1);
    await send(chatId, attempt && fails + 1 >= MAX_CODE_ATTEMPTS
      ? 'Слишком много неверных попыток.'
      : 'Пришлите код доступа одним сообщением.');
  }

  function exportPending() {
    return inbox.snapshot();
  }

  function importPending(entries) {
    for (const entry of entries || []) {
      inbox.restore(entry.chatId, entry.issue, entry.expiresAt);
    }
  }

  function exportEditors() {
    return [...editors].sort();
  }

  function importEditors(ids) {
    for (const id of ids || []) editors.add(String(id));
  }

  function exportDenials() {
    return Object.fromEntries([...denials].sort(([left], [right]) => left.localeCompare(right)));
  }

  function importDenials(entries) {
    for (const [id, count] of Object.entries(entries || {})) {
      const attempts = Number(count);
      if (Number.isSafeInteger(attempts) && attempts > 0) denials.set(String(id), attempts);
    }
  }

  return {
    handleUpdate,
    stop,
    exportPending,
    importPending,
    exportEditors,
    importEditors,
    exportDenials,
    importDenials,
  };
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

  const mode = config.editorCode
    ? 'editor code'
    : config.allowlist
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

function safeEqual(left, right) {
  const given = Buffer.from(String(left));
  const expected = Buffer.from(String(right));
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
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

function foreignFile(message) {
  if (message.document && !pdfDocument(message)) return true;
  return Boolean(
    message.photo
    || message.video
    || message.audio
    || message.voice
    || message.video_note
    || message.animation
    || message.sticker
  );
}

function pdfDocument(message) {
  const doc = message.document;
  if (!doc?.file_id) return null;
  const name = String(doc.file_name || '').toLowerCase();
  const mime = String(doc.mime_type || '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return doc;
  return null;
}

function isPdf(bytes) {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

function helpText() {
  return [
    'Пришлите выпуск одним PDF-файлом.',
    'Файл не больше 20 МБ.',
    'Новый файл заменяет предыдущий выпуск.',
  ].join('\n');
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
