import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './index.js';
import { ISSUE_IMAGE_PATH, ISSUE_IMAGE_PUBLIC_PATH, ISSUE_JSON_PATH } from './issue.js';

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
      const sha = input.path.endsWith('.jpg') ? 'photoshA' : 'jsonsha1';
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
      waitMs: options.waitMs ?? 180_000,
    },
    github,
    send: async (chatId, text) => {
      sent.push({ chatId, text });
    },
    download: async (fileId) => {
      downloads.push(fileId);
      if (downloadError) throw downloadError;
      return Buffer.from('jpeg-bytes');
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

function photoMessage(extra) {
  return {
    update_id: extra.updateId ?? 1,
    message: {
      message_id: extra.updateId ?? 1,
      chat: { id: extra.chatId ?? 42 },
      caption: extra.caption,
      text: extra.text,
      photo: [{ file_id: 'small' }, { file_id: 'big', file_size: 12 }],
      document: extra.document,
    },
  };
}

test('a caption and a photo overwrite the json and the image', async () => {
  const bot = app();
  try {
    await bot.handleUpdate(photoMessage({ caption: COMPLETE }));
    assert.deepEqual(bot.downloads, ['big']);
    assert.deepEqual(bot.puts.map((put) => put.path), [ISSUE_IMAGE_PATH, ISSUE_JSON_PATH]);
    assert.equal(bot.puts[0].message, 'Publish issue photo');
    assert.equal(bot.puts[0].bytes.toString(), 'jpeg-bytes');
    assert.equal(bot.puts[1].message, 'Publish issue: Христос воскресе');
    const doc = JSON.parse(bot.puts[1].bytes.toString('utf8'));
    assert.deepEqual(doc, {
      headline: 'Христос воскресе',
      theme: 'Пасха',
      text: 'Первая строка',
      image: ISSUE_IMAGE_PUBLIC_PATH,
      updatedAt: '2026-11-23T06:53:00.000Z',
    });
    assert.equal(bot.sent.length, 1);
    assert.match(bot.sent[0].text, /Выпуск записан/);
    assert.match(bot.sent[0].text, /commit\/jsonsha1/);
    assert.match(bot.sent[0].text, /commit\/photoshA/);
    assert.equal(bot.sent[0].text.includes(TOKEN), false);
  } finally {
    bot.stop();
  }
});

test('text then a photo in the same chat publishes once', async () => {
  const bot = app();
  try {
    await bot.handleUpdate({
      update_id: 1,
      message: { chat: { id: 42 }, text: COMPLETE },
    });
    assert.equal(bot.puts.length, 0);
    assert.match(bot.sent[0].text, /Текст принят/);

    await bot.handleUpdate(photoMessage({ updateId: 2 }));
    assert.equal(bot.puts.length, 2);
    const doc = JSON.parse(bot.puts[1].bytes.toString('utf8'));
    assert.equal(doc.headline, 'Христос воскресе');
  } finally {
    bot.stop();
  }
});

test('a failed download keeps the pending text for the next photo', async () => {
  const bot = app();
  try {
    await bot.handleUpdate({
      update_id: 1,
      message: { chat: { id: 42 }, text: COMPLETE },
    });
    bot.failDownload(new Error(`network ${TOKEN}`));
    await bot.handleUpdate(photoMessage({ updateId: 2 }));
    assert.equal(bot.puts.length, 0);
    assert.match(bot.sent.at(-1).text, /Не удалось скачать фото/);
    assert.equal(bot.sent.at(-1).text.includes(TOKEN), false);

    bot.failDownload(null);
    await bot.handleUpdate(photoMessage({ updateId: 3 }));
    assert.equal(bot.puts.length, 2);
  } finally {
    bot.stop();
  }
});

test('missing fields and chatter get the right reply', async () => {
  const bot = app();
  try {
    await bot.handleUpdate({
      update_id: 1,
      message: { chat: { id: 42 }, text: 'Заголовок: Христос\nТема: Пасха' },
    });
    assert.match(bot.sent[0].text, /Не хватает полей: текст/);

    await bot.handleUpdate({
      update_id: 2,
      message: { chat: { id: 42 }, text: 'добрый день' },
    });
    assert.equal(bot.sent.length, 1);
    assert.equal(bot.puts.length, 0);
  } finally {
    bot.stop();
  }
});

test('allowlist blocks other chats, and /chatid still answers', async () => {
  const bot = app({ allowlist: new Set(['42']) });
  try {
    await bot.handleUpdate(photoMessage({ chatId: 99, caption: COMPLETE, updateId: 1 }));
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

test('an open allowlist is what runs when the env var is unset', async () => {
  const bot = app({ allowlist: null });
  try {
    await bot.handleUpdate({
      update_id: 1,
      message: { chat: { id: 7 }, text: '/help@esvetvisit_bot' },
    });
    assert.match(bot.sent[0].text, /Заголовок: \.\.\./);
    assert.match(bot.sent[0].text, /Текст: \.\.\./);
  } finally {
    bot.stop();
  }
});

test('an oversized photo does not drop the pending text', async () => {
  const bot = app();
  try {
    await bot.handleUpdate({
      update_id: 1,
      message: { chat: { id: 42 }, text: COMPLETE },
    });
    await bot.handleUpdate({
      update_id: 2,
      message: {
        chat: { id: 42 },
        photo: [{ file_id: 'huge', file_size: 21 * 1024 * 1024 }],
      },
    });
    assert.match(bot.sent.at(-1).text, /больше 20/);
    assert.equal(bot.downloads.length, 0);
    await bot.handleUpdate(photoMessage({ updateId: 3 }));
    assert.equal(bot.puts.length, 2);
  } finally {
    bot.stop();
  }
});

test('a GitHub error is redacted and a JSON failure keeps the photo URL', async () => {
  const bot = app({ failOn: ISSUE_JSON_PATH });
  try {
    await bot.handleUpdate(photoMessage({ caption: COMPLETE }));
    assert.equal(bot.puts.length, 1);
    assert.equal(bot.puts[0].path, ISSUE_IMAGE_PATH);
    const reply = bot.sent[0].text;
    assert.match(reply, /Не удалось записать выпуск/);
    assert.match(reply, /commit\/photoshA/);
    assert.equal(reply.includes(GITHUB_TOKEN), false);
    assert.equal(reply.includes(TOKEN), false);
  } finally {
    bot.stop();
  }
});

test('a document is not published', async () => {
  const bot = app();
  try {
    await bot.handleUpdate({
      update_id: 1,
      message: {
        chat: { id: 42 },
        caption: COMPLETE,
        document: { file_id: 'doc', mime_type: 'image/jpeg' },
      },
    });
    assert.match(bot.sent[0].text, /не как файл/);
    assert.equal(bot.puts.length, 0);
  } finally {
    bot.stop();
  }
});

test('channel posts are accepted', async () => {
  const bot = app();
  try {
    await bot.handleUpdate({
      update_id: 1,
      channel_post: {
        chat: { id: -100 },
        caption: COMPLETE,
        photo: [{ file_id: 'only', file_size: 4 }],
      },
    });
    assert.equal(bot.puts.length, 2);
    assert.equal(bot.sent[0].chatId, -100);
  } finally {
    bot.stop();
  }
});
