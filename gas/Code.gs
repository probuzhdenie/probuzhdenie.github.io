const MAIL_TO = "k253vo@mail.ru";
// Темы писем — по ним фильтруют почту.
const SUBJECTS = {
  pastor: "Обращение к пастору с сайта Probuzhdenie-visit",
  prayer: "Молитвенная записка с сайта Probuzhdenie-visit",
};
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const MIN_AGE_MS = 3000;
const BURST_LIMIT = 8;
const BURST_WINDOW_SEC = 600;
const DAILY_LIMIT = 40;

// После правки: Развёртывания → изменить → новая версия. Иначе сайт продолжит вызывать старый код.

function issueToken_() {
  const now = Date.now();
  return sign_({
    iat: now,
    exp: now + TOKEN_TTL_MS,
    nonce: Utilities.getUuid(),
  });
}

function doGet() {
  try {
    return json({ ok: true, token: issueToken_() });
  } catch (error) {
    return json({ ok: false, reason: "bad" });
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 8000) return json({ ok: false, reason: "bad" });
    const data = JSON.parse(raw);
    if (data.issue === "token") return json({ ok: true, token: issueToken_() });
    if (String(data.fax || "").trim()) return json({ ok: true });

    const name = String(data.name || "").trim();
    const contact = String(data.contact || "").trim();
    const message = String(data.message || "").trim();
    const subject = SUBJECTS[String(data.kind || "").trim()];
    if (
      !subject ||
      !name ||
      !message ||
      name.length > 200 ||
      contact.length > 200 ||
      message.length > 5000
    ) {
      return json({ ok: false, reason: "bad" });
    }
    if ((message.match(/https?:\/\/|www\./gi) || []).length > 2) {
      return json({ ok: false, reason: "bad" });
    }

    const token = readToken_(data.token);
    if (!token) return json({ ok: false, reason: "bad" });
    if (token.early) return json({ ok: false, reason: "soon" });

    const gate = takeSlot_(token);
    if (gate !== "ok") return json({ ok: false, reason: gate });

    const lines = [message, "", "Имя: " + name];
    if (contact) lines.push("Телефон или почта: " + contact);
    const letter = {
      to: MAIL_TO,
      subject: subject,
      body: lines.join("\n"),
    };
    if (contact.indexOf("@") !== -1) letter.replyTo = contact;
    MailApp.sendEmail(letter);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, reason: "bad" });
  }
}

function secret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("FORM_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("FORM_SECRET", secret);
  }
  return secret;
}

function sign_(payload) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  const sig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(body, secret_()),
  );
  return body + "." + sig;
}

function readToken_(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 500) return null;
  const dot = token.indexOf(".");
  if (dot < 1 || token.indexOf(".", dot + 1) !== -1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(body, secret_()),
  );
  if (!safeEqual_(sig, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString(),
    );
  } catch (error) {
    return null;
  }
  if (!payload || typeof payload.nonce !== "string") return null;
  if (payload.nonce.length < 8 || payload.nonce.length > 80) return null;
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;

  const now = Date.now();
  if (payload.exp <= now || payload.exp - payload.iat > TOKEN_TTL_MS) return null;
  if (payload.iat > now + 60 * 1000) return null;
  if (now - payload.iat < MIN_AGE_MS) return { early: true };
  return payload;
}

function takeSlot_(token) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return "rate";
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return "rate";
    const cache = CacheService.getScriptCache();
    const nonceKey = "n:" + token.nonce;
    if (cache.get(nonceKey)) return "bad";
    const now = Date.now();
    if (!rememberBurst_(cache, now)) return "rate";
    if (!rememberDay_(now)) return "rate";
    const ttl = Math.max(1, Math.min(21600, Math.ceil((token.exp - now) / 1000)));
    cache.put(nonceKey, "1", ttl);
    return "ok";
  } finally {
    lock.releaseLock();
  }
}

function rememberBurst_(cache, now) {
  const windowMs = BURST_WINDOW_SEC * 1000;
  const raw = cache.get("burst");
  let count = 0;
  let start = now;
  if (raw) {
    const parts = String(raw).split(":");
    const savedCount = Number(parts[0]);
    const savedStart = Number(parts[1]);
    if (savedStart && now - savedStart < windowMs) {
      count = savedCount;
      start = savedStart;
    }
  }
  if (count >= BURST_LIMIT) return false;
  const ttl = Math.max(1, Math.ceil((start + windowMs - now) / 1000));
  cache.put("burst", count + 1 + ":" + start, ttl);
  return true;
}

function rememberDay_(now) {
  const props = PropertiesService.getScriptProperties();
  const day = Utilities.formatDate(new Date(now), "Europe/Moscow", "yyyy-MM-dd");
  const key = "sent:" + day;
  const count = Number(props.getProperty(key) || "0");
  if (count >= DAILY_LIMIT) return false;
  const stale = Object.keys(props.getProperties()).filter(function (name) {
    return name.indexOf("sent:") === 0 && name !== key;
  });
  stale.forEach(function (name) {
    props.deleteProperty(name);
  });
  props.setProperty(key, String(count + 1));
  return true;
}

function safeEqual_(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
