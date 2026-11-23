export const ISSUE_PDF_PATH = 'public/data/issue.pdf';
export const ISSUE_JSON_PATH = 'public/data/issue.json';
export const ISSUE_IMAGE_PATH = 'public/data/issue.jpg';
export const ISSUE_IMAGE_PUBLIC_PATH = 'data/issue.jpg';

const FIELD_ORDER = ['headline', 'theme', 'text'];

const FIELD_LABELS = {
  headline: 'заголовок',
  theme: 'тема',
  text: 'текст',
};

const LABEL_RE = /^(заголовок|тема|текст)\s*:\s*(.*)$/iu;

export function parseIssue(text) {
  const fields = {
    headline: '',
    theme: '',
    text: '',
  };
  let recognized = false;
  let current = null;
  const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  for (const rawLine of src.split('\n')) {
    const match = rawLine.trim().match(LABEL_RE);
    if (match) {
      recognized = true;
      current = normalizeLabel(match[1]);
      fields[current] = match[2].trim();
      continue;
    }
    if (!current) continue;
    const line = rawLine.trim();
    if (fields[current].length === 0) {
      if (line.length > 0) fields[current] = line;
    } else {
      fields[current] += `\n${line}`;
    }
  }

  for (const key of FIELD_ORDER) fields[key] = fields[key].trim();

  const missing = FIELD_ORDER.filter((key) => !fields[key]);
  if (missing.length > 0) {
    return { ok: false, recognized, missing };
  }

  return {
    ok: true,
    recognized: true,
    issue: {
      headline: fields.headline,
      theme: fields.theme,
      text: fields.text,
    },
  };
}

export function missingLabels(missing) {
  return missing.map((key) => FIELD_LABELS[key] || key);
}

export function buildIssueDocument(issue, updatedAt) {
  if (!issue?.headline || !issue?.theme || !issue?.text) {
    throw new Error('Issue needs a headline, a theme, and text');
  }
  return {
    headline: issue.headline,
    theme: issue.theme,
    text: issue.text,
    image: ISSUE_IMAGE_PUBLIC_PATH,
    updatedAt,
  };
}

export function createInbox({ waitMs, now = () => Date.now() }) {
  const pending = new Map();

  function accept({ chatId, text, hasPhoto }) {
    const key = String(chatId);
    const parsed = parseIssue(text || '');

    if (hasPhoto && parsed.ok) {
      pending.delete(key);
      return { action: 'commit', issue: parsed.issue };
    }

    if (hasPhoto) {
      if (parsed.recognized) {
        return { action: 'reject', reason: 'missing', missing: parsed.missing };
      }
      const stored = pending.get(key);
      if (!stored) return { action: 'reject', reason: 'need_text' };
      if (stored.expiresAt < now()) {
        pending.delete(key);
        return { action: 'reject', reason: 'expired' };
      }
      pending.delete(key);
      return { action: 'commit', issue: stored.issue, expiresAt: stored.expiresAt };
    }

    if (!String(text || '').trim() || !parsed.recognized) {
      return { action: 'ignore' };
    }
    if (!parsed.ok) {
      return { action: 'reject', reason: 'missing', missing: parsed.missing };
    }

    pending.set(key, { issue: parsed.issue, expiresAt: now() + waitMs });
    return { action: 'wait_photo', waitMs };
  }

  function hasPending(chatId) {
    const key = String(chatId);
    const stored = pending.get(key);
    if (!stored) return false;
    if (stored.expiresAt < now()) {
      pending.delete(key);
      return false;
    }
    return true;
  }

  function restore(chatId, issue, expiresAt) {
    pending.set(String(chatId), { issue, expiresAt });
  }

  function expire(chatId, { force = false } = {}) {
    const key = String(chatId);
    const stored = pending.get(key);
    if (!stored) return false;
    if (!force && stored.expiresAt >= now()) return false;
    pending.delete(key);
    return true;
  }

  function snapshot() {
    const entries = [];
    for (const [chatId, stored] of pending) {
      if (stored.expiresAt < now()) continue;
      entries.push({ chatId, issue: stored.issue, expiresAt: stored.expiresAt });
    }
    return entries;
  }

  return { accept, hasPending, restore, expire, snapshot };
}

function normalizeLabel(label) {
  const compact = label.toLowerCase().replace(/\s+/g, '');
  if (compact === 'тема') return 'theme';
  if (compact === 'заголовок') return 'headline';
  if (compact === 'текст') return 'text';
  throw new Error(`Unknown label ${label}`);
}
