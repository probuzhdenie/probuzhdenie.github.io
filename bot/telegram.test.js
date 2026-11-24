import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadPhoto, sendMessage } from './telegram.js';

test('download errors do not include the bot token', async () => {
  const token = '123456:ABC-secret';
  await assert.rejects(
    () => downloadPhoto({
      token,
      fileId: 'file-1',
      fetchImpl: async () => {
        throw new Error(`connect ECONNRESET ${token}`);
      },
    }),
    (err) => {
      assert.equal(err.message.includes(token), false);
      assert.match(err.message, /getFile failed/);
      return true;
    },
  );
});

test('a rate limit is retried and the message is still sent', async () => {
  const token = '123456:ABC-secret';
  let calls = 0;
  await sendMessage({
    token,
    chatId: 1,
    text: 'Пришлите выпуск файлом PDF.',
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 429,
          ok: false,
          async json() {
            return {
              ok: false,
              description: 'Too Many Requests: retry after 0',
              parameters: { retry_after: 0 },
            };
          },
        };
      }
      return {
        status: 200,
        ok: true,
        async json() {
          return { ok: true, result: {} };
        },
      };
    },
  });
  assert.equal(calls, 2);
});

test('API descriptions that echo the token are redacted', async () => {
  const token = '123456:ABC-secret';
  await assert.rejects(
    () => sendMessage({
      token,
      chatId: 1,
      text: 'hi',
      fetchImpl: async () => ({
        status: 401,
        ok: false,
        async json() {
          return { ok: false, description: `Unauthorized ${token}` };
        },
      }),
    }),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.message.includes(token), false);
      assert.match(err.message, /\[redacted\]/);
      return true;
    },
  );
});
