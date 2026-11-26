import { NextResponse } from "next/server";
import { notebooklmService } from "@/modules/notebooklm/service";
import { requireUser, notebookError } from "@/modules/notebooklm/http";

type RouteContext = { params: Promise<{ id: string; artifactId: string }> };

/** Serves the interactive view (used by quiz/flashcard artifacts) as raw HTML
 *  for a sandboxed iframe. The quota is on NotebookLM, not us. */
export async function GET(_req: Request, ctx: RouteContext) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { artifactId } = await ctx.params;
    const html = await notebooklmService.getInteractiveHtml(
      authed.userId,
      artifactId
    );
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return notebookError(err);
  }
}
