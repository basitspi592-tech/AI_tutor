const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const readline = require("readline");

const ENV_PATH = path.join(__dirname, "..", ".env");
const GMAIL_USER = process.argv[2] || "basitspi592@gmail.com";

function hiddenPrompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      if (["\n", "\r", ""].includes(String(char))) process.stdin.removeListener("data", onData);
      else {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(question + "•".repeat(rl.line.length));
      }
    };
    process.stdin.on("data", onData);
    rl.question(question, (answer) => {
      rl.output.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}

function updateEnv(appPassword) {
  let content = fs.readFileSync(ENV_PATH, "utf8");
  const values = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: GMAIL_USER,
    SMTP_APP_PASSWORD: appPassword,
    EMAIL_FROM: `AI Tutor <${GMAIL_USER}>`,
  };

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}="${value}"`;
    const re = new RegExp(`^${key}=.*$`, "m");
    content = re.test(content) ? content.replace(re, line) : `${content}\n${line}\n`;
  }

  fs.writeFileSync(ENV_PATH, content, "utf8");
}

async function main() {
  console.log("Setting up real Gmail delivery for OTP codes.\n");
  console.log(`  1. Open  https://myaccount.google.com/apppasswords`);
  console.log(`  2. Generate an app password for ${GMAIL_USER}`);
  console.log(`  3. Paste it below (input is hidden)\n`);

  const appPassword = (await hiddenPrompt("  App password: ")).replace(/\s/g, "");

  if (!appPassword) {
    console.log("No password entered. Nothing changed.");
    return;
  }

  updateEnv(appPassword);
  console.log(`\n.env updated. Testing connection...`);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: appPassword },
  });

  try {
    await transporter.verify();
    console.log("Login OK.");
  } catch (err) {
    console.log(`Login FAILED: ${err.code || ""} ${err.message}`);
    if (err.responseCode === 535) {
      console.log("");
      console.log("  535 = app password rejected. Check that:");
      console.log("   - 2-Step Verification is actually ON");
      console.log("   - you pasted the 16 char APP password, not your normal password");
      console.log("   - no leftover spaces or quotes");
    }
    return;
  }

  const code = Math.floor(100000 + Math.random() * 900000);
  try {
    await transporter.sendMail({
      from: `AI Tutor <${GMAIL_USER}>`,
      to: GMAIL_USER,
      subject: `${code} is your AI Tutor verification code`,
      text: `Your AI Tutor verification code is ${code}\n\nIt expires in 10 minutes.`,
    });
    console.log(`Test email sent to ${GMAIL_USER} with code ${code}`);
    console.log("Check your Gmail inbox and spam folder.");
  } catch (err) {
    console.log(`Send FAILED: ${err.code || ""} ${err.message}`);
  }
}

main();
