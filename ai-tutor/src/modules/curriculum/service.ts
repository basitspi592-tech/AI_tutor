import { prisma } from "@/lib/db";

export class CurriculumService {
  async getSubjects() {
    return prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { topics: true } },
      },
    });
  }

  async getSubjectBySlug(slug: string) {
    return prisma.subject.findUnique({
      where: { slug },
      include: {
        topics: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  }

  async getTopicsBySubject(subjectId: string) {
    return prisma.topic.findMany({
      where: { subjectId, isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        subject: true,
        _count: { select: { mastery: true } },
      },
    });
  }
}

export const curriculumService = new CurriculumService();
