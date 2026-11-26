import { NextResponse } from "next/server";
import { notebooklmService } from "@/modules/notebooklm/service";
import { requireUser, notebookError } from "@/modules/notebooklm/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { id } = await ctx.params;
    const artifacts = await notebooklmService.listArtifacts(authed.userId, id);
    return NextResponse.json({ artifacts });
  } catch (err) {
    return notebookError(err);
  }
}

export async function POST(req: Request, ctx: RouteContext) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const artifact = await notebooklmService.generateArtifact(
      authed.userId,
      id,
      body
    );
    return NextResponse.json({ artifact }, { status: 201 });
  } catch (err) {
    return notebookError(err);
  }
}
