import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { videoService, VideoGenerationError } from "@/modules/video/service";

const createSchema = z.object({
  topic: z.string().trim().min(3, "Topic is too short").max(300, "Topic is too long"),
});

const QUOTA_HINT =
  "The free daily AI quota is exhausted, so narration cannot be generated right now. Quotas reset at midnight Pacific Time.";

function toPublic(record: {
  id: string;
  topic: string;
  status: string;
  summary: string | null;
  script: string | null;
  sections: unknown;
  sources: unknown;
  durationSeconds: number | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
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
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const videos = await videoService.list(session.user.id);
  return NextResponse.json({ videos: videos.map(toPublic) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const record = await videoService.create(session.user.id, parsed.data.topic);
    return NextResponse.json({ video: toPublic(record) }, { status: 202 });
  } catch (err) {
    console.error("Video create error:", err);
    if (err instanceof VideoGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: QUOTA_HINT }, { status: 502 });
  }
}
