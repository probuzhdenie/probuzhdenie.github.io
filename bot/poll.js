import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, redactSecrets } from './config.js';
import { createApp } from './index.js';
import { downloadPhoto, getUpdates, sendMessage } from './telegram.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, 'bot', 'state.json');

export function normalizeState(value) {
  const offset = Number(value?.offset);
  const pending = Array.isArray(value?.pending) ? value.pending : [];
  return {
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
    pending: pending.filter((entry) => entry && entry.chatId != null && entry.issue && entry.expiresAt),
  };
}

export function readStateFile(file = STATE_PATH) {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    if (err.code === 'ENOENT') return { offset: 0, pending: [] };
    throw err;
  }
}

function sameState(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function setOutput(key, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  fs.appendFileSync(file, `${key}=${value}\n`);
}

export async function runPoll({
  config,
  fetchImpl,
  now = () => Date.now(),
  readState = () => readStateFile(),
  writeFile,
  log = console,
}) {
  const state = normalizeState(readState());
  const written = [];
  const app = createApp({
    config,
    github: {
      async putFile(input) {
        written.push(input);
        return { commitUrl: '', sha: null };
      },
    },
    send: (chatId, text) => sendMessage({ token: config.token, chatId, text, fetchImpl }),
    download: (fileId) => downloadPhoto({ token: config.token, fileId, fetchImpl }),
    now,
    log,
  });

  try {
    app.importPending(state.pending);
    let offset = state.offset;
    const updates = await getUpdates({
      token: config.token,
      offset,
      timeout: 0,
      fetchImpl,
    });
    let published = false;
    for (const update of updates) {
      const before = written.length;
      try {
        await app.handleUpdate(update);
      } catch (err) {
        log.error(redactSecrets(err, [config.token, config.githubToken]));
        break;
      }
      if (written.length - before >= 2) published = true;
      offset = Number(update.update_id) + 1;
    }

    const next = { offset, pending: app.exportPending() };
    const changed = published || !sameState(state, next);
    if (changed && writeFile) {
      if (published) {
        for (const file of written) writeFile(file.path, file.bytes);
      }
      writeFile('bot/state.json', `${JSON.stringify(next, null, 2)}\n`);
    }
    return { status: published ? 'published' : (changed ? 'state' : 'idle'), state: next };
  } finally {
    app.stop();
  }
}

function defaultWrite(rel, bytes) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
}

async function main() {
  const config = loadConfig(process.env, { requireGithub: false });
  const result = await runPoll({ config, writeFile: defaultWrite });
  setOutput('status', result.status);
  console.log(`Telegram poll status: ${result.status}, offset ${result.state.offset}`);
}

const isDirectRun = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(redactSecrets(err, [process.env.TELEGRAM_BOT_TOKEN, process.env.GITHUB_TOKEN]));
    process.exit(1);
  });
}
