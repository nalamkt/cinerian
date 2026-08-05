import nodemailer from "nodemailer";

const requiredEnv = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_TO"
];

const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length) {
  console.error(`Faltan variables: ${missingEnv.join(", ")}`);
  console.error("Ejemplo:");
  console.error(
    "SMTP_HOST=smtp.tudominio.com SMTP_PORT=587 SMTP_USER=usuario SMTP_PASS=secreto SMTP_FROM=no-reply@tudominio.com SMTP_TO=tuemail@gmail.com node scripts/smtp-test.mjs"
  );
  process.exit(1);
}

const port = Number(process.env.SMTP_PORT);
const secure =
  process.env.SMTP_SECURE === "true" || (process.env.SMTP_SECURE == null && port === 465);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function main() {
  console.log("Probando conexion SMTP...");
  await transporter.verify();
  console.log("Conexion SMTP OK.");

  console.log("Enviando email de prueba...");
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: process.env.SMTP_TO,
    subject: "Cinerian SMTP test",
    text: "Este es un email de prueba simple desde Cinerian.",
    html: "<p>Este es un email de prueba simple desde <strong>Cinerian</strong>.</p>"
  });

  console.log("Email enviado.");
  console.log(`messageId: ${result.messageId}`);
  console.log(`accepted: ${result.accepted.join(", ") || "-"}`);
  console.log(`rejected: ${result.rejected.join(", ") || "-"}`);
  if (result.response) {
    console.log(`response: ${result.response}`);
  }
}

main().catch((error) => {
  console.error("Fallo la prueba SMTP.");
  console.error(error);
  process.exit(1);
});
