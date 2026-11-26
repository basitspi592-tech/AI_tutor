const nodemailer = require("nodemailer");
require("dotenv").config();

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_APP_PASSWORD;
const port = Number(process.env.SMTP_PORT || 465);
const host = process.env.SMTP_HOST || "smtp.gmail.com";
const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : true;

async function main() {
  if (!user || !pass) {
    console.log("SMTP_USER or SMTP_APP_PASSWORD is empty in .env");
    console.log("Codes are currently being printed to the dev server console instead.");
    return;
  }

  console.log(`Connecting to ${host}:${port} as ${user} ...`);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  try {
    await transporter.verify();
    console.log("Login OK.");
  } catch (err) {
    console.log(`Login FAILED: ${err.code || ""} ${err.message}`);
    if (err.responseCode === 535) {
      console.log("");
      console.log("  535 = username or app password rejected.");
      console.log("  - App passwords require 2-Step Verification to be ON first.");
      console.log("  - Use the 16-character app password, NOT your normal password.");
      console.log("  - Remove any spaces from the app password.");
      console.log("  - Generate one at https://myaccount.google.com/apppasswords");
    }
    return;
  }

  const code = Math.floor(100000 + Math.random() * 900000);

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `AI Tutor <${user}>`,
      to: user,
      subject: `${code} is your AI Tutor verification code`,
      text: `Your AI Tutor verification code is ${code}\n\nIt expires in 10 minutes.`,
    });
    console.log(`Test email sent to ${user} with code ${code}`);
    console.log("Check your inbox (and spam folder).");
  } catch (err) {
    console.log(`Send FAILED: ${err.code || ""} ${err.message}`);
  }
}

main();
