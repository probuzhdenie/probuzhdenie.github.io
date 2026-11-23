import assert from 'node:assert/strict';
import test from 'node:test';
import { ISSUE_IMAGE_PATH, ISSUE_JSON_PATH } from './issue.js';
import { runPoll } from './poll.js';

const TOKEN = 'tg-poll-token';
const WHEN = Date.parse('2026-11-23T12:00:00.000Z');
const TEXT = [
  'Заголовок: Христос воскресе',
  'Тема: Пасха',
  'Текст: Первая строка',
].join('\n');

const config = {
  token: TOKEN,
  githubToken: '',
  repo: 'probuzhdenie/probuzhdenie.github.io',
  branch: 'main',
  allowlist: null,
  waitMs: 1_800_000,
};

function json(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    },
  };
}

function telegramFetch(updates, sent) {
  return async (url, options) => {
    const href = String(url);
    assert.equal(href.includes(TOKEN), true);
    if (href.includes('/getUpdates')) {
      return json(200, { ok: true, result: updates });
    }
    if (href.includes('/sendMessage')) {
      const text = JSON.parse(options.body).text;
      assert.equal(text.includes(TOKEN), false);
      sent.push(text);
      return json(200, { ok: true, result: {} });
    }
    if (href.includes('/getFile')) {
      return json(200, { ok: true, result: { file_path: 'photos/issue.jpg' } });
    }
    if (href.includes('/file/bot')) {
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return Uint8Array.from([1, 2, 3]).buffer;
        },
      };
    }
    throw new Error(`unexpected ${href.split(TOKEN).join('[redacted]')}`);
  };
}

test('a complete message writes the issue and advances the offset', async () => {
  const files = new Map();
  const sent = [];
  const result = await runPoll({
    config,
    now: () => WHEN,
    readState: () => ({ offset: 0, pending: [] }),
    writeFile: (rel, bytes) => files.set(rel, Buffer.from(bytes).toString('utf8')),
    fetchImpl: telegramFetch([
      {
        update_id: 10,
        message: {
          chat: { id: 5 },
          caption: TEXT,
          photo: [{ file_id: 'big', file_size: 3 }],
        },
      },
    ], sent),
    log: { error() {}, info() {} },
  });

  assert.equal(result.status, 'published');
  assert.equal(result.state.offset, 11);
  const doc = JSON.parse(files.get(ISSUE_JSON_PATH));
  assert.equal(doc.headline, 'Христос воскресе');
  assert.equal(doc.theme, 'Пасха');
  assert.equal(doc.text, 'Первая строка');
  assert.equal(doc.updatedAt, '2026-11-23T12:00:00.000Z');
  assert.equal(files.has(ISSUE_IMAGE_PATH), true);
  assert.match(sent[0], /Выпуск записан/);
  assert.equal(sent[0].includes(TOKEN), false);
});

test('text and a later photo meet across two polls', async () => {
  const sent = [];
  let state = { offset: 4, pending: [] };
  const files = new Map();
  const writeFile = (rel, bytes) => {
    files.set(rel, Buffer.from(bytes).toString('utf8'));
    if (rel === 'bot/state.json') state = JSON.parse(files.get(rel));
  };

  const first = await runPoll({
    config,
    now: () => WHEN,
    readState: () => state,
    writeFile,
    fetchImpl: telegramFetch([
      { update_id: 4, message: { chat: { id: 5 }, text: TEXT } },
    ], sent),
    log: { error() {}, info() {} },
  });
  assert.equal(first.status, 'state');
  assert.equal(first.state.pending.length, 1);
  assert.equal(files.has(ISSUE_JSON_PATH), false);

  const second = await runPoll({
    config,
    now: () => WHEN + 60_000,
    readState: () => state,
    writeFile,
    fetchImpl: telegramFetch([
      {
        update_id: 5,
        message: { chat: { id: 5 }, photo: [{ file_id: 'big', file_size: 3 }] },
      },
    ], sent),
    log: { error() {}, info() {} },
  });
  assert.equal(second.status, 'published');
  assert.equal(JSON.parse(files.get(ISSUE_JSON_PATH)).headline, 'Христос воскресе');
  assert.equal(second.state.pending.length, 0);
  assert.equal(second.state.offset, 6);
});

test('an empty queue does not write files', async () => {
  let writes = 0;
  const result = await runPoll({
    config,
    readState: () => ({ offset: 8, pending: [] }),
    writeFile: () => {
      writes += 1;
    },
    fetchImpl: telegramFetch([], []),
    log: { error() {}, info() {} },
  });
  assert.equal(result.status, 'idle');
  assert.equal(writes, 0);
});
