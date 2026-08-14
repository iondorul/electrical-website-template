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

module.exports = { sendInvoiceEmail, isConfigured };
