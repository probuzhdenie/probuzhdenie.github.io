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
