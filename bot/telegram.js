export async function getUpdates({ token, offset, timeout = 30, signal, fetchImpl = globalThis.fetch }) {
  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  url.searchParams.set('timeout', String(timeout));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('allowed_updates', '["message","channel_post"]');
  const res = await call(url, { signal }, fetchImpl, 'getUpdates');
  const data = await readJson(res);
  if (!res.ok || data?.ok === false) throw telegramError(res.status, data, 'getUpdates', token);
  return data.result ?? [];
}

export async function sendMessage({ token, chatId, text, fetchImpl = globalThis.fetch }) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await call(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(20_000),
  }, fetchImpl, 'sendMessage');
  const data = await readJson(res);
  if (!res.ok || data?.ok === false) throw telegramError(res.status, data, 'sendMessage', token);
}

export async function downloadPhoto({ token, fileId, fetchImpl = globalThis.fetch }) {
  const metaUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const metaRes = await call(metaUrl, { signal: AbortSignal.timeout(20_000) }, fetchImpl, 'getFile');
  const meta = await readJson(metaRes);
  if (!metaRes.ok || meta?.ok === false) throw telegramError(metaRes.status, meta, 'getFile', token);
  const filePath = meta?.result?.file_path;
  if (!filePath) throw new Error('Telegram getFile returned no file path');

  const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const fileRes = await call(fileUrl, { signal: AbortSignal.timeout(60_000) }, fetchImpl, 'download');
  if (!fileRes.ok) throw new Error(`Telegram download failed (${fileRes.status})`);
  return Buffer.from(await fileRes.arrayBuffer());
}

async function call(url, options, fetchImpl, what) {
  try {
    return await fetchImpl(url, options);
  } catch {
    throw new Error(`Telegram ${what} failed`);
  }
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function telegramError(status, data, what, token) {
  let description = data?.description || `Telegram ${what} failed (${status})`;
  if (token) description = description.split(token).join('[redacted]');
  const error = new Error(description);
  error.status = status;
  return error;
}
