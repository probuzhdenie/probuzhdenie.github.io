const MAIL_TO = "k253vo@mail.ru";
const SUBJECT = "Сообщение/записка с сайта Probuzhdenie-visit";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const name = String(data.name || "").trim();
    const contact = String(data.contact || "").trim();
    const message = String(data.message || "").trim();
    if (
      !name ||
      !message ||
      name.length > 200 ||
      contact.length > 200 ||
      message.length > 5000
    ) {
      return json({ ok: false });
    }
    const lines = [message, "", "Имя: " + name];
    if (contact) lines.push("Телефон или почта: " + contact);
    const letter = {
      to: MAIL_TO,
      subject: SUBJECT,
      body: lines.join("\n"),
    };
    if (contact.indexOf("@") !== -1) letter.replyTo = contact;
    MailApp.sendEmail(letter);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false });
  }
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
