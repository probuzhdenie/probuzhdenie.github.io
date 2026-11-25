const MAIL_TO = "k253vo@mail.ru";
// Темы писем — по ним фильтруют почту.
const SUBJECTS = {
  pastor: "Обращение к пастору с сайта Probuzhdenie-visit",
  prayer: "Молитвенная записка с сайта Probuzhdenie-visit",
};
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const MIN_AGE_MS = 3000;
const DEVICE_DAILY_LIMIT = 5;
const TURNSTILE_ACTION = "note";
const TURNSTILE_HOSTS = {
  "probuzhdenie.github.io": true,
  localhost: true,
  "127.0.0.1": true,
};

// Секрет виджета Cloudflare Turnstile — свойство скрипта TURNSTILE_SECRET.
// Ключ сайта — VITE_TURNSTILE_SITE_KEY. Без секрета письма не уходят.
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
    if (!raw || raw.length > 20000) return json({ ok: false, reason: "bad" });
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
    const verdict = verifyTurnstile_(data.turnstile);
    if (!verdict.ok) return json({ ok: false, reason: verdict.reason, detail: verdict.detail });

    const gate = takeSlot_(token, data.device);
    if (gate !== "ok") return json({ ok: false, reason: gate });

    const lines = [message, "", "Имя: " + name];
    if (contact) lines.push("Телефон или почта: " + contact);
    const letter = {
      to: MAIL_TO,
      subject: subject,
      body: lines.join("\n"),
    };
    const replyTo = replyEmail_(contact);
    if (replyTo) letter.replyTo = replyTo;
    MailApp.sendEmail(letter);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, reason: "bad" });
  }
}

function replyEmail_(value) {
  const email = String(value || "");
  if (!email || email.length > 200) return "";
  if (/[\s,;<>()"\[\]\\]/.test(email)) return "";
  const at = email.indexOf("@");
  if (at < 1 || email.indexOf("@", at + 1) !== -1) return "";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || domain.length > 190) return "";
  if (local.indexOf("..") !== -1 || domain.indexOf("..") !== -1) return "";
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return "";
  if (!/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain)) return "";
  if (domain.charAt(0) === "." || domain.charAt(0) === "-") return "";
  return email;
}

function verifyTurnstile_(token) {
  try {
    if (typeof token !== "string" || token.length < 10 || token.length > 4096) {
      return { ok: false, reason: "captcha", detail: "token" };
    }
    const secret = String(
      PropertiesService.getScriptProperties().getProperty("TURNSTILE_SECRET") || "",
    ).trim();
    if (!secret) return { ok: false, reason: "secret", detail: "empty" };
    const response = UrlFetchApp.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "post",
      payload: {
        secret: secret,
        response: token,
      },
      muteHttpExceptions: true,
    });
    let data = null;
    try {
      data = JSON.parse(response.getContentText() || "");
    } catch (parseError) {
      return { ok: false, reason: "captcha", detail: "http " + response.getResponseCode() };
    }
    if (!data || data.success !== true) {
      const rawCodes = data && data["error-codes"];
      const codes = Array.isArray(rawCodes) ? rawCodes.join(" ") : "no-codes";
      const reason =
        codes.indexOf("invalid-input-secret") !== -1 || codes.indexOf("missing-input-secret") !== -1
          ? "secret"
          : "captcha";
      return { ok: false, reason: reason, detail: codes };
    }
    const host = String(data.hostname || "").toLowerCase();
    if (!TURNSTILE_HOSTS[host]) return { ok: false, reason: "captcha", detail: "host " + host };
    const action = String(data.action || "");
    if (action && action !== TURNSTILE_ACTION) {
      return { ok: false, reason: "captcha", detail: "action " + action };
    }
    return { ok: true };
  } catch (error) {
    const message = String(error && error.message ? error.message : error)
      .replace(/0x[0-9A-Za-z_-]{8,}/g, "secret")
      .slice(0, 160);
    return { ok: false, reason: "captcha", detail: message || "exception" };
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

function deviceKey_(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return "";
  return id;
}

function takeSlot_(token, deviceId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return "rate";
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return "rate";
    const cache = CacheService.getScriptCache();
    const nonceKey = "n:" + token.nonce;
    if (cache.get(nonceKey)) return "bad";
    const gate = rememberDevice_(Date.now(), deviceId);
    if (gate !== "ok") return gate;
    const ttl = Math.max(1, Math.min(21600, Math.ceil((token.exp - Date.now()) / 1000)));
    cache.put(nonceKey, "1", ttl);
    return "ok";
  } finally {
    lock.releaseLock();
  }
}

function rememberDevice_(now, rawId) {
  const id = deviceKey_(rawId);
  if (!id) return "bad";
  const props = PropertiesService.getScriptProperties();
  const day = Utilities.formatDate(new Date(now), "Europe/Moscow", "yyyy-MM-dd");
  const prefix = "dev:" + day + ":";
  const key = prefix + id;
  const all = props.getProperties();
  const count = Number(all[key] || "0");
  if (count >= DEVICE_DAILY_LIMIT) return "device";
  Object.keys(all).forEach(function (name) {
    const oldDevice = name.indexOf("dev:") === 0 && name.indexOf(prefix) !== 0;
    const oldTotal = name.indexOf("sent:") === 0;
    if (oldDevice || oldTotal) props.deleteProperty(name);
  });
  props.setProperty(key, String(count + 1));
  return "ok";
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
