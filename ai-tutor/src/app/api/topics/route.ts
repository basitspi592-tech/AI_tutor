import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subjectId = new URL(req.url).searchParams.get("subjectId");

  const topics = await prisma.topic.findMany({
    where: {
      isActive: true,
      ...(subjectId ? { subjectId } : {}),
    },
    orderBy: { sortOrder: "asc" },
    include: {
      subject: { select: { id: true, name: true, slug: true, icon: true } },
    },
  });

  return NextResponse.json({ topics });
}
