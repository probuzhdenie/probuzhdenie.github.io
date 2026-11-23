export function createGithub({ token, repo, branch, fetchImpl = globalThis.fetch }) {
  if (!token) throw new Error('Missing GITHUB_TOKEN');
  const [owner, name] = repo.split('/');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'esvetvisit-issue-bot',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  function contentsUrl(filePath) {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodedPath}`;
  }

  async function request(url, options) {
    try {
      return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      throw new Error(`GitHub request failed (${err.name || 'error'})`);
    }
  }

  async function readSha(filePath) {
    const url = `${contentsUrl(filePath)}?ref=${encodeURIComponent(branch)}`;
    const res = await request(url, { headers });
    if (res.status === 404) {
      try {
        await res.body?.cancel?.();
      } catch {
        // The body is unused when the file is absent.
      }
      return null;
    }
    const body = await readBody(res);
    if (!res.ok) throw githubError(res.status, filePath, body);
    if (Array.isArray(body)) throw new Error(`GitHub path is a directory: ${filePath}`);
    if (!body?.sha) throw new Error(`GitHub response has no sha for ${filePath}`);
    return body.sha;
  }

  async function putFile({ path, bytes, message }) {
    const content = Buffer.from(bytes).toString('base64');
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sha = await readSha(path);
      const payload = { message, content, branch };
      if (sha) payload.sha = sha;
      const res = await request(contentsUrl(path), {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      const body = await readBody(res);
      if (res.ok) {
        const commitSha = body?.commit?.sha;
        const commitUrl = body?.commit?.html_url
          || (commitSha ? `https://github.com/${repo}/commit/${commitSha}` : '');
        if (!commitUrl) throw new Error(`GitHub response has no commit URL for ${path}`);
        return { commitUrl, sha: commitSha || null };
      }
      lastError = githubError(res.status, path, body);
      if (res.status !== 409 && res.status !== 422) throw lastError;
    }

    throw lastError;
  }

  return { putFile };
}

async function readBody(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function githubError(status, filePath, body) {
  const detail = body?.message || 'request failed';
  return new Error(`GitHub ${status} for ${filePath}: ${detail}`);
}
