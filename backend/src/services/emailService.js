// backend/src/services/emailService.js
const nodemailer = require("nodemailer");

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM;

// timeouts para não "travar" a request
const CONNECTION_TIMEOUT_MS = Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS || 8000);
const GREETING_TIMEOUT_MS = Number(process.env.EMAIL_GREETING_TIMEOUT_MS || 8000);
const SOCKET_TIMEOUT_MS = Number(process.env.EMAIL_SOCKET_TIMEOUT_MS || 12000);

const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: EMAIL_PORT === 465,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },

  // ✅ isso evita ficar esperando eternamente
  connectionTimeout: CONNECTION_TIMEOUT_MS,
  greetingTimeout: GREETING_TIMEOUT_MS,
  socketTimeout: SOCKET_TIMEOUT_MS,

  // ajuda em alguns ambientes/proxies
  tls: { servername: EMAIL_HOST },
});

async function verifyEmailTransporter() {
  try {
    await transporter.verify();
    console.log("[emailService] SMTP conectado com sucesso.");
  } catch (err) {
    console.error("[emailService] Falha ao conectar no SMTP:", err.message);
  }
}
verifyEmailTransporter();

async function sendEmail({ to, subject, html }) {
  if (!to || !subject || !html) throw new Error("sendEmail: parâmetros obrigatórios ausentes.");

  return transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });
}

module.exports = { sendEmail };
