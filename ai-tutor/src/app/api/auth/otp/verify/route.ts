import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createResetToken,
  OtpError,
  verifyOtp,
  type OtpKind,
} from "@/lib/otp";

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(10),
  kind: z.enum(["EMAIL_VERIFICATION", "PASSWORD_RESET"]),
});

const STATUS_BY_CODE: Record<string, number> = {
  rate_limited: 429,
  invalid_code: 400,
  expired: 400,
  too_many_attempts: 429,
  not_found: 400,
};

export async function POST(req: Request) {
  try {
    const parsed = verifySchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { email, code, kind } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const otp = await verifyOtp(normalizedEmail, code, kind as OtpKind);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.oneTimePassword.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      }),
      ...(kind === "EMAIL_VERIFICATION"
        ? [
            prisma.user.update({
              where: { id: user.id },
              data: { emailVerified: new Date() },
            }),
          ]
        : []),
    ]);

    if (kind === "PASSWORD_RESET") {
      return NextResponse.json({ resetToken: createResetToken(otp.id, user.id) });
    }

    return NextResponse.json({ verified: true });
  } catch (error) {
    if (error instanceof OtpError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: STATUS_BY_CODE[error.code] ?? 400 },
      );
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
