import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './index.js';
import { ISSUE_PDF_PATH } from './issue.js';

const TOKEN = 'tg-secret-token';
const GITHUB_TOKEN = 'gh-secret-token';
const WHEN = Date.parse('2026-11-23T06:53:00.000Z');

const COMPLETE = [
  'Заголовок: Христос воскресе',
  'Тема: Пасха',
  'Текст: Первая строка',
].join('\n');

function app(options = {}) {
  const sent = [];
  const puts = [];
  const downloads = [];
  let downloadError = null;
  const github = {
    async putFile(input) {
      if (options.failOn === input.path) {
        const error = new Error(`GitHub 500 for ${input.path}: ${GITHUB_TOKEN}`);
        throw error;
      }
      puts.push(input);
      const sha = input.path.endsWith('.pdf') ? 'pdfsha1' : 'filesha1';
      return {
        sha,
        commitUrl: `https://github.com/probuzhdenie/probuzhdenie.github.io/commit/${sha}`,
      };
    },
  };
  const created = createApp({
    config: {
      token: TOKEN,
      githubToken: GITHUB_TOKEN,
      repo: 'probuzhdenie/probuzhdenie.github.io',
      branch: 'main',
      allowlist: options.allowlist ?? null,
      editorCode: options.editorCode ?? '',
      waitMs: options.waitMs ?? 180_000,
    },
    github,
    send: async (chatId, text) => {
      sent.push({ chatId, text });
    },
    download: async (fileId) => {
      downloads.push(fileId);
      if (downloadError) throw downloadError;
      return Buffer.from('%PDF-1.4\n');
    },
    now: () => WHEN,
    log: { error() {}, info() {} },
  });
  return {
    ...created,
    sent,
    puts,
    downloads,
    failDownload(error) {
      downloadError = error;
    },
  };
}

function pdfMessage(extra = {}) {
  return {
    update_id: extra.updateId ?? 1,
    message: {
      message_id: extra.updateId ?? 1,
      chat: { id: extra.chatId ?? 42 },
      document: extra.document ?? {
        file_id: extra.fileId ?? 'issue-pdf',
        file_name: extra.fileName ?? 'issue.pdf',
        mime_type: extra.mime ?? 'application/pdf',
        file_size: extra.fileSize ?? 12,
      },
    },
  };
}

test('a pdf document replaces the newspaper file', async () => {
  const bot = app();
  try {
    await bot.handleUpdate(pdfMessage());
    assert.deepEqual(bot.downloads, ['issue-pdf']);
    assert.deepEqual(bot.puts.map((put) => put.path), [ISSUE_PDF_PATH]);
    assert.equal(bot.puts[0].message, 'Publish newspaper PDF');
    assert.equal(bot.puts[0].bytes.toString(), '%PDF-1.4\n');
    assert.match(bot.sent[0].text, /Выпуск записан/);
    assert.match(bot.sent[0].text, /commit\/pdfsha1/);
    assert.equal(bot.sent[0].text.includes(TOKEN), false);
  } finally {
    bot.stop();
  }
});

test('plain text does not publish, and a failed download can be retried', async () => {
  const bot = app();
  try {
    await bot.handleUpdate({
      update_id: 1,
      message: { chat: { id: 42 }, text: COMPLETE },
    });
    assert.equal(bot.puts.length, 0);
    assert.equal(bot.sent.length, 0);

    bot.failDownload(new Error(`network ${TOKEN}`));
    await bot.handleUpdate(pdfMessage({ updateId: 2 }));
    assert.equal(bot.puts.length, 0);
    assert.match(bot.sent.at(-1).text, /Не удалось скачать PDF/);
    assert.equal(bot.sent.at(-1).text.includes(TOKEN), false);

    bot.failDownload(null);
    await bot.handleUpdate(pdfMessage({ updateId: 3 }));
    assert.equal(bot.puts.length, 1);
  } finally {
    bot.stop();
  }
});

test('allowlist blocks other chats, and /chatid still answers', async () => {
  const bot = app({ allowlist: new Set(['42']) });
  try {
    await bot.handleUpdate(pdfMessage({ chatId: 99, updateId: 1 }));
    assert.match(bot.sent[0].text, /не может публиковать/);
    assert.equal(bot.puts.length, 0);

    await bot.handleUpdate({
      update_id: 2,
      message: { chat: { id: 99 }, text: '/chatid' },
    });
    assert.match(bot.sent[1].text, /99/);

    await bot.handleUpdate({
      update_id: 3,
      message: { chat: { id: 99 }, text: 'просто текст' },
    });
    assert.equal(bot.sent.length, 2);
  } finally {
    bot.stop();
  }
});

test('an editor code blocks strangers until they send it', async () => {
  const bot = app({ editorCode: 'parish-code' });
  try {
    await bot.handleUpdate({
      update_id: 1,
      message: { chat: { id: 77 }, text: '/start' },
    });
    assert.match(bot.sent[0].text, /код доступа/);
    assert.equal(bot.puts.length, 0);

    await bot.handleUpdate(pdfMessage({ chatId: 77, updateId: 2 }));
    assert.equal(bot.puts.length, 0);

    await bot.handleUpdate({
      update_id: 3,
      message: { chat: { id: 77 }, text: 'parish-code' },
    });
    assert.match(bot.sent.at(-1).text, /Доступ открыт/);
    assert.deepEqual(bot.exportEditors(), ['77']);

    await bot.handleUpdate(pdfMessage({ chatId: 77, updateId: 4 }));
    assert.equal(bot.puts.length, 1);
  } finally {
    bot.stop();
  }
});

test('an open allowlist is what runs when the env var is unset', async () => {
  const bot = app({ allowlist: null });
  try {
    await bot.handleUpdate({
      update_id: 1,
      message: { chat: { id: 7 }, text: '/help@esvetvisit_bot' },
    });
    assert.match(bot.sent[0].text, /PDF-файлом/);
  } finally {
    bot.stop();
  }
});

test('an oversized pdf is refused before download', async () => {
  const bot = app();
  try {
    await bot.handleUpdate(pdfMessage({ updateId: 1, fileSize: 21 * 1024 * 1024 }));
    assert.match(bot.sent.at(-1).text, /больше 20/);
    assert.equal(bot.downloads.length, 0);
    assert.equal(bot.puts.length, 0);
  } finally {
    bot.stop();
  }
});

test('a GitHub error is redacted', async () => {
  const bot = app({ failOn: ISSUE_PDF_PATH });
  try {
    await bot.handleUpdate(pdfMessage());
    const reply = bot.sent[0].text;
    assert.match(reply, /Не удалось записать выпуск/);
    assert.equal(reply.includes(GITHUB_TOKEN), false);
    assert.equal(reply.includes(TOKEN), false);
  } finally {
    bot.stop();
  }
});

test('a file that is not a pdf is refused', async () => {
  const bot = app();
  try {
    await bot.handleUpdate(pdfMessage({
      document: { file_id: 'doc', file_name: 'note.jpg', mime_type: 'image/jpeg' },
    }));
    assert.match(bot.sent[0].text, /файлом PDF/);
    assert.equal(bot.puts.length, 0);
  } finally {
    bot.stop();
  }
});

test('channel posts with a pdf are accepted', async () => {
  const bot = app();
  try {
    await bot.handleUpdate({
      update_id: 1,
      channel_post: pdfMessage({ chatId: -100 }).message,
    });
    assert.equal(bot.puts.length, 1);
    assert.equal(bot.puts[0].path, ISSUE_PDF_PATH);
    assert.equal(bot.sent[0].chatId, -100);
  } finally {
    bot.stop();
  }
});
