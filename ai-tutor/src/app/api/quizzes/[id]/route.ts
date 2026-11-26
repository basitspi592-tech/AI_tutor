import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assessmentService } from "@/modules/assessment/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await ctx.params;
  const quiz = await assessmentService.getQuiz(userId, id);
  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  return NextResponse.json({ quiz });
}

export async function POST(req: Request, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const answers: number[] = Array.isArray(body.answers) ? body.answers : [];

    const result = await assessmentService.submitQuiz(userId, id, answers);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("Quiz submission failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit quiz" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title : "";

    const quiz = await assessmentService.updateQuizTitle(session.user.id, id, title);
    return NextResponse.json({ quiz });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update quiz";
    return NextResponse.json(
      { error: message },
      { status: message === "Quiz not found" ? 404 : 400 }
    );
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    await assessmentService.deleteQuiz(session.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete quiz";
    return NextResponse.json(
      { error: message },
      { status: message === "Quiz not found" ? 404 : 400 }
    );
  }
}
