import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ISSUE_IMAGE_PUBLIC_PATH,
  buildIssueDocument,
  createInbox,
  parseIssue,
} from './issue.js';

const COMPLETE = [
  'Заголовок: Христос воскресе',
  'Тема: Пасха',
  'Текст: Первая колонка',
  'строка ещё',
].join('\n');

test('parses a complete issue, including a multiline column', () => {
  const parsed = parseIssue(COMPLETE);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.issue, {
    headline: 'Христос воскресе',
    theme: 'Пасха',
    text: 'Первая колонка\nстрока ещё',
  });
});

test('accepts spaced and capitalized labels in any order', () => {
  const parsed = parseIssue([
    'Добрый день',
    'ТЕКСТ: первая: с двоеточием',
    'ещё строка',
    'ЗАГОЛОВОК: заголовок',
    'Тема: тема',
  ].join('\n'));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.issue.text, 'первая: с двоеточием\nещё строка');
  assert.equal(parsed.issue.theme, 'тема');
  assert.equal(parsed.issue.headline, 'заголовок');
});

test('keeps the last value when a label is repeated', () => {
  const parsed = parseIssue([
    'тема: первая',
    'тема: вторая',
    'заголовок: h',
    'текст: a',
  ].join('\n'));
  assert.equal(parsed.issue.theme, 'вторая');
});

test('reports missing labels and ignores chatter', () => {
  const missing = parseIssue('Заголовок: Христос воскресе\nТема: Пасха');
  assert.equal(missing.ok, false);
  assert.equal(missing.recognized, true);
  assert.deepEqual(missing.missing, ['text']);
  const chatter = parseIssue('привет');
  assert.equal(chatter.recognized, false);
});

test('builds the issue document in the published shape', () => {
  const doc = buildIssueDocument({
    headline: 'h',
    theme: 't',
    text: 'a',
  }, '2026-11-23T06:53:00.000Z');
  assert.deepEqual(Object.keys(doc), ['headline', 'theme', 'text', 'image', 'updatedAt']);
  assert.equal(doc.image, ISSUE_IMAGE_PUBLIC_PATH);
  assert.equal(doc.updatedAt, '2026-11-23T06:53:00.000Z');
});

test('placeholder issue.json matches the empty document', async () => {
  const raw = await readFile(new URL('../public/data/issue.json', import.meta.url), 'utf8');
  const doc = JSON.parse(raw);
  assert.deepEqual(doc, {
    headline: '',
    theme: '',
    text: '',
    image: ISSUE_IMAGE_PUBLIC_PATH,
    updatedAt: null,
  });
  assert.equal(raw.endsWith('\n'), true);
});

test('waits for a photo, then commits the stored text', () => {
  let clock = 1_000;
  const inbox = createInbox({ waitMs: 1_000, now: () => clock });
  const waited = inbox.accept({ chatId: 7, text: COMPLETE, hasPhoto: false });
  assert.equal(waited.action, 'wait_photo');

  clock = 2_000;
  const committed = inbox.accept({ chatId: '7', text: '', hasPhoto: true });
  assert.equal(committed.action, 'commit');
  assert.equal(committed.issue.headline, 'Христос воскресе');
});

test('a photo with a full caption commits immediately', () => {
  const inbox = createInbox({ waitMs: 1_000, now: () => 0 });
  const result = inbox.accept({ chatId: 1, text: COMPLETE, hasPhoto: true });
  assert.equal(result.action, 'commit');
  assert.equal(inbox.hasPending(1), false);
});

test('a late photo expires and a new text replaces the pending one', () => {
  let clock = 0;
  const inbox = createInbox({ waitMs: 1_000, now: () => clock });
  inbox.accept({ chatId: 1, text: COMPLETE, hasPhoto: false });
  clock = 1_001;
  const expired = inbox.accept({ chatId: 1, text: '', hasPhoto: true });
  assert.deepEqual(expired, { action: 'reject', reason: 'expired' });

  const other = COMPLETE.replace('Пасха', 'Рождество');
  clock = 2_000;
  inbox.accept({ chatId: 1, text: COMPLETE, hasPhoto: false });
  inbox.accept({ chatId: 1, text: other, hasPhoto: false });
  const committed = inbox.accept({ chatId: 1, text: '', hasPhoto: true });
  assert.equal(committed.issue.theme, 'Рождество');
});

test('a partial caption does not fall back to a pending issue', () => {
  const inbox = createInbox({ waitMs: 5_000, now: () => 0 });
  inbox.accept({ chatId: 1, text: COMPLETE, hasPhoto: false });
  const result = inbox.accept({
    chatId: 1,
    text: 'тема: только тема',
    hasPhoto: true,
  });
  assert.equal(result.action, 'reject');
  assert.equal(result.reason, 'missing');
  assert.equal(inbox.hasPending(1), true);
});

test('photo without text asks for the issue', () => {
  const inbox = createInbox({ waitMs: 5_000, now: () => 0 });
  const result = inbox.accept({ chatId: 1, text: '', hasPhoto: true });
  assert.deepEqual(result, { action: 'reject', reason: 'need_text' });
});
