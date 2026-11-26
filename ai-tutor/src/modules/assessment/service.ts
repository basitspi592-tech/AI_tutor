import { prisma } from "@/lib/db";
import { getAIProvider } from "@/modules/ai-providers";

export class AssessmentService {
  async generateQuiz(
    userId: string,
    params: { topicId?: string; topicName?: string; questionCount?: number } = {}
  ) {
    const questionCount = params.questionCount ?? 5;
    let topic: {
      id: string;
      name: string;
      subjectId: string;
      subject: { name: string };
    } | null = null;
    let topicName = "";

    if (params.topicId) {
      topic = await prisma.topic.findUnique({
        where: { id: params.topicId },
        include: { subject: true },
      });

      if (!topic) throw new Error("Topic not found");
      topicName = topic.name;
    } else if (params.topicName?.trim()) {
      topicName = params.topicName.trim();
    } else {
      throw new Error("Topic is required");
    }

    const provider = getAIProvider();

    const subjectClause = topic ? ` in the subject "${topic.subject.name}"` : "";
    const prompt = `Generate a quiz with ${questionCount} multiple choice questions about "${topicName}"${subjectClause}.

Return ONLY a JSON array with this exact format:
[
  {
    "question": "Question text?",
    "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
    "correctIndex": 0,
    "explanation": "Why this answer is correct"
  }
]

No markdown, no extra text, just the JSON array.`;

    const reply = await provider.chat({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    let questions;
    try {
      let cleaned = reply.replace(/```(?:json)?/gi, "").trim();
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      if (start !== -1 && end > start) {
        cleaned = cleaned.slice(start, end + 1);
      }
      questions = JSON.parse(cleaned);
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error("Invalid questions");
      }
    } catch {
      questions = [
        {
          question: `What is an important concept in ${topicName}?`,
          options: ["A) Concept A", "B) Concept B", "C) Concept C", "D) Concept D"],
          correctIndex: 0,
          explanation: "This is a fundamental concept.",
        },
      ];
    }

    const quiz = await prisma.quiz.create({
      data: {
        userId,
        subjectId: topic?.subjectId,
        topicId: topic?.id,
        title: `Quiz: ${topicName}`,
        questions,
        status: "PENDING",
      },
    });

    return quiz;
  }

  async submitQuiz(userId: string, quizId: string, answers: number[]) {
    const quiz = await prisma.quiz.findFirst({
      where: { id: quizId, userId },
    });

    if (!quiz) throw new Error("Quiz not found");
    if (quiz.status === "COMPLETED") throw new Error("Quiz already completed");

    const questions = quiz.questions as Array<{
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }>;

    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) correct++;
    });

    const score = (correct / questions.length) * 100;

    const updated = await prisma.quiz.update({
      where: { id: quizId },
      data: {
        answers,
        score,
        totalPoints: questions.length,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    if (quiz.topicId) {
      const existing = await prisma.mastery.findUnique({
        where: { userId_topicId: { userId, topicId: quiz.topicId } },
      });

      if (existing) {
        const newTotal = existing.totalAttempts + 1;
        const newCorrect = existing.correctAttempts + correct;
        const newScore = (newCorrect / (newTotal * questions.length)) * 100;

        await prisma.mastery.update({
          where: { id: existing.id },
          data: {
            score: newScore,
            totalAttempts: newTotal,
            correctAttempts: newCorrect,
            lastAssessedAt: new Date(),
          },
        });
      } else {
        await prisma.mastery.create({
          data: {
            userId,
            topicId: quiz.topicId,
            score,
            totalAttempts: 1,
            correctAttempts: correct,
            lastAssessedAt: new Date(),
          },
        });
      }
    }

    return { quiz: updated, correct, total: questions.length, score };
  }

  async getQuiz(userId: string, quizId: string) {
    return prisma.quiz.findFirst({
      where: { id: quizId, userId },
    });
  }

  async getUserQuizzes(userId: string) {
    return prisma.quiz.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async updateQuizTitle(userId: string, quizId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("Title is required");

    const quiz = await prisma.quiz.findFirst({
      where: { id: quizId, userId },
    });
    if (!quiz) throw new Error("Quiz not found");

    return prisma.quiz.update({
      where: { id: quizId },
      data: { title: trimmed },
    });
  }

  async deleteQuiz(userId: string, quizId: string) {
    const quiz = await prisma.quiz.findFirst({
      where: { id: quizId, userId },
    });
    if (!quiz) throw new Error("Quiz not found");

    await prisma.quiz.delete({ where: { id: quizId } });
    return { ok: true };
  }
}

export const assessmentService = new AssessmentService();
