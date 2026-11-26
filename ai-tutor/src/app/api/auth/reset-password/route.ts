import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readResetToken } from "@/lib/otp";

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  try {
    const parsed = resetSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { token, password } = parsed.data;

    const claims = readResetToken(token);
    if (!claims) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Please request a new one." },
        { status: 400 },
      );
    }

    const otp = await prisma.oneTimePassword.findUnique({
      where: { id: claims.otpId },
      select: { userId: true, consumedAt: true, expiresAt: true },
    });

    if (
      !otp ||
      otp.userId !== claims.userId ||
      !otp.consumedAt ||
      otp.expiresAt < new Date()
    ) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Please request a new one." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: claims.userId },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      }),
      prisma.session.deleteMany({ where: { userId: claims.userId } }),
      prisma.oneTimePassword.deleteMany({ where: { userId: claims.userId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
