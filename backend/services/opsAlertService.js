const nodemailer = require('nodemailer');

function isEnabled() {
  return String(process.env.ALERT_EMAIL_ENABLED || '').toLowerCase() === 'true';
}

function getRecipients() {
  const raw = process.env.ALERT_EMAIL_TO || '';
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendOpsAlert(subject, details = []) {
  if (!isEnabled()) return { sent: false, reason: 'alert email disabled' };

  const recipients = getRecipients();
  if (recipients.length === 0) return { sent: false, reason: 'no recipients configured' };

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { sent: false, reason: 'smtp credentials incomplete' };
  }

  const now = new Date().toISOString();
  const lines = Array.isArray(details) ? details : [String(details || '')];
  const text = [
    `Time: ${now}`,
    ...lines,
  ].join('\n');

  const transporter = createTransport();
  await transporter.sendMail({
    from: process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER,
    to: recipients.join(', '),
    subject,
    text,
  });

  return { sent: true, recipients: recipients.length };
}

module.exports = {
  sendOpsAlert,
};
