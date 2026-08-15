require("dotenv").config();
const nodemailer = require("nodemailer");

async function main() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.verify();
  console.log("SMTP connection OK");

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: "iondorul@yahoo.com",
    subject: "Test SMTP2GO - ElectricalVPF",
    text: "Acesta este un email de test pentru a confirma integrarea SMTP2GO in backend.",
  });

  console.log("Email trimis:", info.messageId, info.response);
}

main().catch((err) => {
  console.error("EROARE:", err.message);
  process.exit(1);
});
