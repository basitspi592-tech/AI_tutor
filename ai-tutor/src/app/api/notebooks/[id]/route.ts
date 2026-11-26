import { NextResponse } from "next/server";
import { notebooklmService } from "@/modules/notebooklm/service";
import { requireUser, notebookError } from "@/modules/notebooklm/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: RouteContext) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { id } = await ctx.params;
    const result = await notebooklmService.removeNotebook(authed.userId, id);
    return NextResponse.json(result);
  } catch (err) {
    return notebookError(err);
  }
}
