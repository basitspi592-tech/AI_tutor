import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [totalQuizzes, completedQuizzes, masteryData, conversationCount] =
    await Promise.all([
      prisma.quiz.count({ where: { userId } }),
      prisma.quiz.count({ where: { userId, status: "COMPLETED" } }),
      prisma.mastery.findMany({
        where: { userId },
        include: { topic: { include: { subject: true } } },
        orderBy: { score: "desc" },
      }),
      prisma.conversation.count({ where: { userId } }),
    ]);

  const avgScore =
    masteryData.length > 0
      ? masteryData.reduce((sum, m) => sum + m.score, 0) / masteryData.length
      : 0;

  const subjectProgress = new Map<
    string,
    { name: string; score: number; count: number }
  >();

  masteryData.forEach((m) => {
    const subjectId = m.topic.subjectId;
    const existing = subjectProgress.get(subjectId);
    if (existing) {
      existing.score += m.score;
      existing.count += 1;
    } else {
      subjectProgress.set(subjectId, {
        name: m.topic.subject.name,
        score: m.score,
        count: 1,
      });
    }
  });

  const subjects = Array.from(subjectProgress.values()).map((s) => ({
    name: s.name,
    averageScore: s.count > 0 ? s.score / s.count : 0,
  }));

  return NextResponse.json({
    overall: {
      averageScore: Math.round(avgScore * 100) / 100,
      quizzesTaken: completedQuizzes,
      totalQuizzes,
      conversations: conversationCount,
    },
    subjects,
    topics: masteryData.map((m) => ({
      topic: m.topic.name,
      subject: m.topic.subject.name,
      score: m.score,
      totalAttempts: m.totalAttempts,
      correctAttempts: m.correctAttempts,
    })),
  });
}
