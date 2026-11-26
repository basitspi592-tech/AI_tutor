import { NextResponse } from "next/server";
import { notebooklmService } from "@/modules/notebooklm/service";
import { requireUser, notebookError } from "@/modules/notebooklm/http";

type RouteContext = { params: Promise<{ id: string; artifactId: string }> };

/** Polls NotebookLM for generation progress. Safe to call repeatedly. */
export async function POST(_req: Request, ctx: RouteContext) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { artifactId } = await ctx.params;
    const artifact = await notebooklmService.refreshArtifact(
      authed.userId,
      artifactId
    );
    return NextResponse.json({ artifact });
  } catch (err) {
    return notebookError(err);
  }
}

/** Streams a finished video artifact for inline playback. */
export async function GET(_req: Request, ctx: RouteContext) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { artifactId } = await ctx.params;
    const { buffer, contentType } = await notebooklmService.getArtifactFile(
      authed.userId,
      artifactId
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return notebookError(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { artifactId } = await ctx.params;
    const result = await notebooklmService.removeArtifact(
      authed.userId,
      artifactId
    );
    return NextResponse.json(result);
  } catch (err) {
    return notebookError(err);
  }
}
