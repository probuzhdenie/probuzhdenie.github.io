import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithub } from './github.js';

const TOKEN = 'github-test-token';

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: String(status),
    async json() {
      return body;
    },
  };
}

test('creates a file when the path is missing', async () => {
  const calls = [];
  const github = createGithub({
    token: TOKEN,
    repo: 'probuzhdenie/probuzhdenie.github.io',
    branch: 'main',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      const method = options.method || 'GET';
      if (method === 'GET') return jsonResponse(404, { message: 'Not Found' });
      return jsonResponse(201, {
        commit: {
          sha: 'abc123',
          html_url: 'https://github.com/probuzhdenie/probuzhdenie.github.io/commit/abc123',
        },
      });
    },
  });

  const result = await github.putFile({
    path: 'public/data/issue.json',
    bytes: '{"ok":true}\n',
    message: 'Publish issue: test',
  });

  assert.equal(result.commitUrl, 'https://github.com/probuzhdenie/probuzhdenie.github.io/commit/abc123');
  const put = calls.find((call) => call.options.method === 'PUT');
  const body = JSON.parse(put.options.body);
  assert.equal(body.sha, undefined);
  assert.equal(body.branch, 'main');
  assert.equal(body.message, 'Publish issue: test');
  assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), '{"ok":true}\n');
  assert.equal(put.options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(JSON.stringify(body).includes(TOKEN), false);
  assert.equal(put.url, 'https://api.github.com/repos/probuzhdenie/probuzhdenie.github.io/contents/public/data/issue.json');
});

test('sends the current sha when the file already exists', async () => {
  const github = createGithub({
    token: TOKEN,
    repo: 'probuzhdenie/probuzhdenie.github.io',
    branch: 'main',
    fetchImpl: async (url, options) => {
      if (!options.method || options.method === 'GET') {
        assert.match(String(url), /ref=main$/);
        return jsonResponse(200, { sha: 'oldsha', type: 'file' });
      }
      const body = JSON.parse(options.body);
      assert.equal(body.sha, 'oldsha');
      return jsonResponse(200, {
        commit: { sha: 'newsha', html_url: 'https://github.com/probuzhdenie/probuzhdenie.github.io/commit/newsha' },
      });
    },
  });

  const result = await github.putFile({
    path: 'public/data/issue.jpg',
    bytes: Buffer.from([0xff, 0xd8, 0xff]),
    message: 'Publish issue photo',
  });
  assert.equal(result.sha, 'newsha');
});

test('retries a conflict once with a fresh sha', async () => {
  let gets = 0;
  let puts = 0;
  const github = createGithub({
    token: TOKEN,
    repo: 'probuzhdenie/probuzhdenie.github.io',
    branch: 'main',
    fetchImpl: async (_url, options) => {
      const method = options.method || 'GET';
      if (method === 'GET') {
        gets += 1;
        if (gets === 1) return jsonResponse(404, { message: 'Not Found' });
        return jsonResponse(200, { sha: 'fresh', type: 'file' });
      }
      puts += 1;
      if (puts === 1) return jsonResponse(409, { message: 'Conflict' });
      assert.equal(JSON.parse(options.body).sha, 'fresh');
      return jsonResponse(200, { commit: { sha: 'done' } });
    },
  });

  const result = await github.putFile({
    path: 'public/data/issue.json',
    bytes: '{}',
    message: 'Publish issue: x',
  });
  assert.equal(result.commitUrl, 'https://github.com/probuzhdenie/probuzhdenie.github.io/commit/done');
  assert.equal(puts, 2);
});

test('errors do not include the token or the request URL', async () => {
  const github = createGithub({
    token: TOKEN,
    repo: 'probuzhdenie/probuzhdenie.github.io',
    branch: 'main',
    fetchImpl: async () => {
      throw new Error(`socket hang up ${TOKEN} https://api.github.com/repos/x`);
    },
  });

  await assert.rejects(
    () => github.putFile({ path: 'public/data/issue.json', bytes: '{}', message: 'x' }),
    (err) => {
      assert.equal(err.message.includes(TOKEN), false);
      assert.equal(err.message.includes('https://'), false);
      assert.match(err.message, /GitHub request failed/);
      return true;
    },
  );
});

test('a directory path is an error', async () => {
  const github = createGithub({
    token: TOKEN,
    repo: 'probuzhdenie/probuzhdenie.github.io',
    branch: 'main',
    fetchImpl: async () => jsonResponse(200, [{ name: 'issue.json' }]),
  });
  await assert.rejects(
    () => github.putFile({ path: 'data', bytes: '{}', message: 'x' }),
    /directory/,
  );
});
