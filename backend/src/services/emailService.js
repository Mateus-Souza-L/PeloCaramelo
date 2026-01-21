// backend/src/services/emailService.js
const nodemailer = require("nodemailer");

/* ============================================================
   Validação de ambiente
   ============================================================ */

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM;

if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS || !EMAIL_FROM) {
  console.warn(
    "[emailService] Variáveis de e-mail incompletas. " +
      "Envio de e-mails pode falhar."
  );
}

/* ============================================================
   Transporter
   ============================================================ */

// Porta 465 -> secure true | 587 -> secure false
const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: EMAIL_PORT === 465,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

/* ============================================================
   Teste de conexão (opcional, mas MUITO recomendado)
   ============================================================ */

async function verifyEmailTransporter() {
  try {
    await transporter.verify();
    console.log("[emailService] SMTP conectado com sucesso.");
  } catch (err) {
    console.error("[emailService] Falha ao conectar no SMTP:", err.message);
  }
}

// Executa apenas uma vez no boot
verifyEmailTransporter();

/* ============================================================
   Envio de e-mail
   ============================================================ */

async function sendEmail({ to, subject, html }) {
  if (!to || !subject || !html) {
    throw new Error("sendEmail: parâmetros obrigatórios ausentes.");
  }

  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });

    return info;
  } catch (err) {
    console.error("[emailService] Erro ao enviar e-mail:", err);
    throw err;
  }
}

module.exports = {
  sendEmail,
};
