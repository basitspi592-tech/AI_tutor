import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT ?? 465);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_APP_PASSWORD;

const isConfigured = Boolean(smtpUser && smtpPass);

const fromAddress =
  process.env.EMAIL_FROM ??
  (smtpUser ? `AI Tutor <${smtpUser}>` : "AI Tutor <no-reply@localhost>");

const globalForMailer = globalThis as unknown as {
  transporter: nodemailer.Transporter | undefined;
};

function getTransporter(): nodemailer.Transporter {
  if (globalForMailer.transporter) return globalForMailer.transporter;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  if (process.env.NODE_ENV !== "production") globalForMailer.transporter = transporter;
  return transporter;
}

function shell(content: string) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px 16px;background:#070712;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(129,140,248,0.2);border-radius:24px;padding:36px;">
      <div style="font-size:24px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">AI Tutor</div>
      <div style="font-size:13px;color:rgba(148,163,184,0.7);margin-bottom:28px;">Your personal learning companion</div>
      ${content}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;line-height:1.6;color:rgba(148,163,184,0.5);">
        If you did not request this email you can safely ignore it.
      </div>
    </div>
  </body>
</html>`;
}

function codeBlock(code: string) {
  return `<div style="text-align:center;margin:28px 0;">
    <div style="display:inline-block;padding:20px 36px;background:linear-gradient(135deg,#6366f1,#7c3aed);border-radius:18px;box-shadow:0 0 32px rgba(99,102,241,0.35);">
      <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#ffffff;">${code}</span>
    </div>
  </div>`;
}

function textBody(code: string, intro: string, outro: string) {
  return `${intro}\n\n    ${code}\n\n${outro}\n\nThis code expires in 10 minutes. If you did not request this email you can safely ignore it.`;
}

function buildOtpEmail(code: string, purpose: "verify" | "reset") {
  const isReset = purpose === "reset";

  const subject = isReset
    ? `${code} is your AI Tutor password reset code`
    : `${code} is your AI Tutor verification code`;

  const heading = isReset ? "Reset your password" : "Verify your email";
  const intro = isReset
    ? "We received a request to reset the password for your AI Tutor account. Enter this code to continue:"
    : "Welcome to AI Tutor. Enter this code to confirm your email address and activate your account:";

  const outro = isReset
    ? "If you did not request a password reset, you can ignore this email and your password will stay unchanged."
    : "If you did not create an AI Tutor account, you can ignore this email.";

  return {
    subject,
    text: textBody(code, intro, outro),
    html: shell(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;">${heading}</h1>
      <p style="margin:0;font-size:14px;line-height:1.7;color:rgba(148,163,184,0.8);">${intro}</p>
      ${codeBlock(code)}
      <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(148,163,184,0.7);">${outro}</p>
    `),
  };
}

export type OtpMailPurpose = "verify" | "reset";

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: OtpMailPurpose,
): Promise<void> {
  const { subject, text, html } = buildOtpEmail(code, purpose);

  if (!isConfigured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured. Set SMTP_USER and SMTP_APP_PASSWORD.");
    }

    console.warn(
      `\n[mailer] SMTP not configured - email not sent.\n` +
        `[mailer] to=${to} subject=${subject}\n` +
        `[mailer] code=${code}\n`,
    );
    return;
  }

  await getTransporter().sendMail({ from: fromAddress, to, subject, text, html });
}

export function isMailerConfigured(): boolean {
  return isConfigured;
}
