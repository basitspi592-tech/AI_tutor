import { NextResponse } from "next/server";
import { notebooklmService } from "@/modules/notebooklm/service";
import { requireUser, notebookError } from "@/modules/notebooklm/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { id } = await ctx.params;
    const sources = await notebooklmService.listSources(authed.userId, id);
    return NextResponse.json({ sources });
  } catch (err) {
    return notebookError(err);
  }
}

export async function POST(req: Request, ctx: RouteContext) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { id } = await ctx.params;
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const source = await notebooklmService.addSource(authed.userId, id, {
        file: file instanceof File ? file : undefined,
      });
      return NextResponse.json({ source }, { status: 201 });
    }

    const body = (await req.json()) as {
      url?: string;
      text?: string;
      title?: string;
    };
    const source = await notebooklmService.addSource(authed.userId, id, body);
    return NextResponse.json({ source }, { status: 201 });
  } catch (err) {
    return notebookError(err);
  }
}
