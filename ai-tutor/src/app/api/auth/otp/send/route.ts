import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { issueOtp, OTP_TTL_MINUTES, OtpError, type OtpKind } from "@/lib/otp";
import { checkOtpSendLimit } from "@/lib/rate-limit";

const sendSchema = z.object({
  email: z.string().email(),
  kind: z.enum(["EMAIL_VERIFICATION", "PASSWORD_RESET"]),
});

const STATUS_BY_CODE: Record<string, number> = {
  rate_limited: 429,
  invalid_code: 400,
  expired: 400,
  too_many_attempts: 429,
  not_found: 400,
};

function clientKey(request: Request, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return `${ip}:${email}`;
}

export async function POST(req: Request) {
  try {
    const parsed = sendSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { email, kind } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const limit = checkOtpSendLimit(clientKey(req, normalizedEmail));
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, emailVerified: true, deletedAt: true },
    });

    const eligible =
      !!user &&
      !user.deletedAt &&
      (kind !== "EMAIL_VERIFICATION" || !user.emailVerified);

    if (eligible) {
      await issueOtp(normalizedEmail, kind as OtpKind, user.id);
    }

    return NextResponse.json({
      sent: true,
      expiresInMinutes: OTP_TTL_MINUTES,
    });
  } catch (error) {
    if (error instanceof OtpError) {
      const status = STATUS_BY_CODE[error.code] ?? 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status,
          ...(error.retryAfter
            ? { headers: { "Retry-After": String(error.retryAfter) } }
            : {}),
        },
      );
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
