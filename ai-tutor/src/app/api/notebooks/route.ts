import { NextResponse } from "next/server";
import { notebooklmService } from "@/modules/notebooklm/service";
import { requireUser, notebookError } from "@/modules/notebooklm/http";

export async function GET() {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  const notebooks = await notebooklmService.list(authed.userId);
  return NextResponse.json({ notebooks, connected: notebooklmService.isConfigured() });
}

export async function POST(req: Request) {
  const authed = await requireUser();
  if ("response" in authed) return authed.response;

  try {
    const { title } = (await req.json()) as { title?: string };
    const notebook = await notebooklmService.create(authed.userId, title ?? "");
    return NextResponse.json({ notebook }, { status: 201 });
  } catch (err) {
    return notebookError(err);
  }
}
