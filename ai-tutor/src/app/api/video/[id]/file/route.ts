import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { auth } from "@/lib/auth";
import { parseRange } from "@/modules/video/http";
import { videoService } from "@/modules/video/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const VIDEO_DIR = path.resolve(UPLOAD_DIR, "videos");

export async function GET(req: Request, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const record = await videoService.get(session.user.id, id);
  if (!record) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  if (record.status !== "READY") {
    return NextResponse.json({ error: "Video is not ready yet" }, { status: 409 });
  }

  const wantsAudio = new URL(req.url).searchParams.get("stream") === "audio";
  const stored = wantsAudio ? record.audioPath : record.videoPath;
  if (!stored) {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }

  // The path comes from our own writes, but re-derive it from the record id and
  // owner so a tampered row can never escape the user's directory.
  const expected = path.join(VIDEO_DIR, session.user.id, `${record.id}.${wantsAudio ? "wav" : "mp4"}`);
  const resolved = path.resolve(stored);
  if (resolved !== expected) {
    console.error("Refusing to serve unexpected video path:", resolved);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }

  let size: number;
  try {
    size = (await stat(resolved)).size;
  } catch {
    return NextResponse.json({ error: "File is missing from storage" }, { status: 404 });
  }

  const type = wantsAudio ? "audio/wav" : "video/mp4";
  const download = new URL(req.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  const filename = `${record.id}.${wantsAudio ? "wav" : "mp4"}`;

  const range = parseRange(req.headers.get("range"), size);
  const headers = new Headers({
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${disposition}; filename="${filename}"`,
    "Cache-Control": "private, max-age=3600",
  });

  if (req.headers.get("range") && !range) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new NextResponse(Readable.toWeb(createReadStream(resolved, range)) as ReadableStream, {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(size));
  return new NextResponse(Readable.toWeb(createReadStream(resolved)) as ReadableStream, {
    headers,
  });
}
