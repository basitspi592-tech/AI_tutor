import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assessmentService } from "@/modules/assessment/service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const quizzes = await assessmentService.getUserQuizzes(userId);
  return NextResponse.json({ quizzes });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await req.json();
    const rawCount = Number(body.questionCount) || 5;
    const questionCount = Math.min(Math.max(rawCount, 1), 100);

    const quiz = await assessmentService.generateQuiz(userId, {
      topicId: body.topicId || undefined,
      topicName: body.topicName || undefined,
      questionCount,
    });

    return NextResponse.json({ quiz }, { status: 201 });
  } catch (err) {
    console.error("Quiz generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate quiz" },
      { status: 500 }
    );
  }
}
