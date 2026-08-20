const nodemailer = require("nodemailer");

function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

function getTransporter() {
  if (!isConfigured()) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendInvoiceEmail({
  to,
  invoiceNumber,
  companyName,
  totalGross,
  currency,
  dueDate,
  pdfBuffer,
}) {
  const transporter = getTransporter();

  const subject = `Factura ${invoiceNumber}${companyName ? ` - ${companyName}` : ""}`;
  const text =
    `Bună ziua,\n\n` +
    `Atașat găsiți factura ${invoiceNumber}, în valoare de ${totalGross} ${currency}, ` +
    `scadentă la data de ${dueDate}.\n\n` +
    `Cu stimă,\n${companyName || ""}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    attachments: [
      {
        filename: `${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

async function sendPasswordResetEmail({ to, fullName, resetLink }) {
  const transporter = getTransporter();

  const subject = "Resetare parolă - ElectricalVPF ERP";
  const text =
    `Bună${fullName ? ` ${fullName}` : ""},\n\n` +
    `Ai solicitat resetarea parolei contului tău ElectricalVPF ERP.\n\n` +
    `Accesează linkul de mai jos pentru a seta o parolă nouă ` +
    `(valabil 1 oră de la această solicitare):\n${resetLink}\n\n` +
    `Dacă nu ai solicitat această acțiune, poți ignora acest email — ` +
    `parola ta rămâne neschimbată.\n\n` +
    `Cu stimă,\nElectricalVPF ERP`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

async function sendPaymentFailedEmail({ to, fullName }) {
  const transporter = getTransporter();

  const subject = "Plată eșuată - abonamentul tău Pro ElectricalVPF ERP";
  const text =
    `Bună${fullName ? ` ${fullName}` : ""},\n\n` +
    `Ultima încercare de plată pentru abonamentul tău Pro a eșuat. ` +
    `Stripe va reîncerca automat plata în zilele următoare — nu trebuie să faci nimic acum, ` +
    `abonamentul tău rămâne activ pe durata acestor reîncercări.\n\n` +
    `Dacă toate reîncercările eșuează, abonamentul va reveni automat la planul Free. ` +
    `Dacă problema persistă, verifică metoda de plată asociată contului tău Stripe.\n\n` +
    `Cu stimă,\nElectricalVPF ERP`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

module.exports = {
  sendInvoiceEmail,
  sendPasswordResetEmail,
  sendPaymentFailedEmail,
  isConfigured,
};
