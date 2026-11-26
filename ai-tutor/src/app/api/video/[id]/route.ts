import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { videoService } from "@/modules/video/service";

type RouteContext = { params: Promise<{ id: string }> };

/** Polled by the client while a render is in flight. */
export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const record = await videoService.get(session.user.id, id);
  if (!record) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  return NextResponse.json({
    video: {
      id: record.id,
      topic: record.topic,
      status: record.status,
      summary: record.summary,
      script: record.script,
      sections: record.sections,
      sources: record.sources,
      durationSeconds: record.durationSeconds,
      errorMessage: record.errorMessage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      videoUrl: record.status === "READY" ? `/api/video/${record.id}/file` : null,
    },
  });
}
