import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendOtpEmail, type OtpMailPurpose } from "@/lib/mailer";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_ISSUES_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;
export const RESET_TOKEN_TTL_MINUTES = 15;

export type OtpKind = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

const KIND_TO_MAIL: Record<OtpKind, OtpMailPurpose> = {
  EMAIL_VERIFICATION: "verify",
  PASSWORD_RESET: "reset",
};

export type OtpErrorCode =
  | "rate_limited"
  | "invalid_code"
  | "expired"
  | "too_many_attempts"
  | "not_found";

export class OtpError extends Error {
  code: OtpErrorCode;
  retryAfter?: number;

  constructor(code: OtpErrorCode, message: string, retryAfter?: number) {
    super(message);
    this.name = "OtpError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function pepper(): string {
  return process.env.AUTH_SECRET ?? "dev-only-otp-pepper";
}

function sha256(value: string): Buffer {
  return createHmac("sha256", pepper()).update(value).digest();
}

export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtpCode(code: string): string {
  return sha256(code.trim()).toString("hex");
}

function codesMatch(code: string, hash: string): boolean {
  const expected = Buffer.from(hash, "hex");
  const actual = sha256(code.trim());
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function issueOtp(email: string, kind: OtpKind, userId?: string) {
  const now = new Date();
  const normalizedEmail = email.trim().toLowerCase();

  const last = await prisma.oneTimePassword.findFirst({
    where: { email: normalizedEmail, purpose: kind },
    orderBy: { createdAt: "desc" },
  });

  if (last) {
    const elapsedSeconds = (now.getTime() - last.createdAt.getTime()) / 1000;
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      throw new OtpError(
        "rate_limited",
        "Please wait before requesting another code.",
        Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds),
      );
    }
  }

  const issuesThisHour = await prisma.oneTimePassword.count({
    where: {
      email: normalizedEmail,
      purpose: kind,
      createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
    },
  });

  if (issuesThisHour >= MAX_ISSUES_PER_HOUR) {
    throw new OtpError(
      "rate_limited",
      "Too many codes requested. Please try again later.",
      60 * 60,
    );
  }

  await prisma.oneTimePassword.updateMany({
    where: { email: normalizedEmail, purpose: kind, consumedAt: null },
    data: { consumedAt: now },
  });

  const code = generateOtpCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

  const otp = await prisma.oneTimePassword.create({
    data: {
      userId,
      email: normalizedEmail,
      purpose: kind,
      codeHash: hashOtpCode(code),
      expiresAt,
    },
  });

  try {
    await sendOtpEmail(normalizedEmail, code, KIND_TO_MAIL[kind]);
  } catch (error) {
    await prisma.oneTimePassword.delete({ where: { id: otp.id } }).catch(() => {});
    throw error;
  }

  return { id: otp.id, expiresAt };
}

export async function verifyOtp(email: string, code: string, kind: OtpKind) {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  const otp = await prisma.oneTimePassword.findFirst({
    where: { email: normalizedEmail, purpose: kind, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    throw new OtpError("not_found", "No active code. Please request a new one.");
  }

  if (otp.expiresAt < now) {
    throw new OtpError("expired", "This code has expired. Please request a new one.");
  }

  if (otp.attempts >= MAX_ATTEMPTS) {
    throw new OtpError(
      "too_many_attempts",
      "Too many incorrect attempts. Please request a new code.",
    );
  }

  if (!codesMatch(code, otp.codeHash)) {
    await prisma.oneTimePassword.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new OtpError("invalid_code", "The code you entered is incorrect.");
  }

  return otp;
}

export function createResetToken(otpId: string, userId: string): string {
  const expiresAt = Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000;
  const payload = `${userId}.${otpId}.${expiresAt}`;
  const signature = createHmac("sha256", pepper()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function readResetToken(token: string): {
  userId: string;
  otpId: string;
} | null {
  let payload: string;
  try {
    payload = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const parts = payload.split(".");
  if (parts.length !== 4) return null;

  const [userId, otpId, expiresAt, signature] = parts;
  const expected = createHmac("sha256", pepper())
    .update(`${userId}.${otpId}.${expiresAt}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

  if (Number(expiresAt) < Date.now()) return null;

  return { userId, otpId };
}
