// The live site is probuzhdenie.github.io. A push to main rebuilds Pages.
const DEFAULT_BRANCH = 'main';
const DEFAULT_REPO = 'probuzhdenie/probuzhdenie.github.io';
const DEFAULT_PHOTO_WAIT_MS = 180_000;

export function loadConfig(env = process.env, { requireGithub = true } = {}) {
  const token = required(env, 'TELEGRAM_BOT_TOKEN');
  const githubToken = requireGithub ? required(env, 'GITHUB_TOKEN') : (env.GITHUB_TOKEN?.trim() || '');
  const repo = env.GITHUB_REPO?.trim() || DEFAULT_REPO;
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error('GITHUB_REPO must look like owner/name');
  }
  const branch = env.TARGET_BRANCH?.trim() || DEFAULT_BRANCH;
  const allowRaw = env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() ?? '';
  const allowlist = allowRaw
    ? new Set(allowRaw.split(/[\s,]+/).filter(Boolean))
    : null;
  const waitRaw = env.PHOTO_WAIT_MS?.trim() || String(DEFAULT_PHOTO_WAIT_MS);
  const waitMs = Number(waitRaw);
  if (!Number.isFinite(waitMs) || waitMs < 1000) {
    throw new Error('PHOTO_WAIT_MS must be a number of milliseconds >= 1000');
  }
  return { token, githubToken, repo, branch, allowlist, waitMs };
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function redactSecrets(value, secrets) {
  let text = value instanceof Error ? value.message : String(value ?? '');
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join('[redacted]');
  }
  return text.slice(0, 500);
}
