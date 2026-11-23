import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, redactSecrets } from './config.js';

const baseEnv = {
  TELEGRAM_BOT_TOKEN: 'tg-token',
  GITHUB_TOKEN: 'gh-token',
};

test('defaults repo, branch, wait, and an open allowlist', () => {
  const config = loadConfig(baseEnv);
  assert.equal(config.repo, 'probuzhdenie/probuzhdenie.github.io');
  assert.equal(config.branch, 'main');
  assert.equal(config.waitMs, 180_000);
  assert.equal(config.allowlist, null);
});

test('parses allowlist and optional overrides', () => {
  const config = loadConfig({
    ...baseEnv,
    GITHUB_REPO: 'probuzhdenie/esvetvisit',
    TARGET_BRANCH: 'gh-pages',
    TELEGRAM_ALLOWED_CHAT_IDS: ' 12, -34\n56 ',
    PHOTO_WAIT_MS: '5000',
  });
  assert.equal(config.repo, 'probuzhdenie/esvetvisit');
  assert.equal(config.branch, 'gh-pages');
  assert.equal(config.waitMs, 5000);
  assert.deepEqual([...config.allowlist], ['12', '-34', '56']);
});

test('rejects missing secrets, a bad repo, and a short wait', () => {
  assert.throws(() => loadConfig({ GITHUB_TOKEN: 'x' }), /Missing TELEGRAM_BOT_TOKEN/);
  assert.throws(() => loadConfig({ ...baseEnv, GITHUB_REPO: 'noslash' }), /owner\/name/);
  assert.throws(() => loadConfig({ ...baseEnv, PHOTO_WAIT_MS: '50' }), /PHOTO_WAIT_MS/);
});

test('redactSecrets removes token text', () => {
  const text = redactSecrets(new Error('failed with gh-token and tg-token'), ['gh-token', 'tg-token']);
  assert.equal(text.includes('gh-token'), false);
  assert.equal(text.includes('tg-token'), false);
  assert.match(text, /\[redacted\]/);
});
