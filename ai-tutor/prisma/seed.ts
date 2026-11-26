import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  const subjects = await Promise.all([
    prisma.subject.upsert({
      where: { slug: "mathematics" },
      update: {},
      create: {
        name: "Mathematics",
        slug: "mathematics",
        description: "Numbers, algebra, geometry, and more",
        icon: "🔢",
        sortOrder: 1,
      },
    }),
    prisma.subject.upsert({
      where: { slug: "science" },
      update: {},
      create: {
        name: "Science",
        slug: "science",
        description: "Physics, chemistry, biology",
        icon: "🔬",
        sortOrder: 2,
      },
    }),
    prisma.subject.upsert({
      where: { slug: "english" },
      update: {},
      create: {
        name: "English",
        slug: "english",
        description: "Grammar, literature, and writing",
        icon: "📚",
        sortOrder: 3,
      },
    }),
    prisma.subject.upsert({
      where: { slug: "history" },
      update: {},
      create: {
        name: "History",
        slug: "history",
        description: "World history and civilizations",
        icon: "🏛️",
        sortOrder: 4,
      },
    }),
  ]);

  console.log(`Created ${subjects.length} subjects`);

  const mathTopics = [
    { name: "Algebra", slug: "algebra", description: "Variables, equations, and functions" },
    { name: "Geometry", slug: "geometry", description: "Shapes, sizes, and spatial properties" },
    { name: "Calculus", slug: "calculus", description: "Limits, derivatives, and integrals" },
    { name: "Statistics", slug: "statistics", description: "Data analysis and probability" },
    { name: "Trigonometry", slug: "trigonometry", description: "Triangles and periodic functions" },
  ];

  const scienceTopics = [
    { name: "Physics", slug: "physics", description: "Matter, energy, and forces" },
    { name: "Chemistry", slug: "chemistry", description: "Elements, compounds, and reactions" },
    { name: "Biology", slug: "biology", description: "Living organisms and life" },
    { name: "Earth Science", slug: "earth-science", description: "Geology, weather, and ecosystems" },
  ];

  const englishTopics = [
    { name: "Grammar", slug: "grammar", description: "Rules of language structure" },
    { name: "Writing", slug: "writing", description: "Essays, stories, and composition" },
    { name: "Literature", slug: "literature", description: "Reading and analyzing texts" },
    { name: "Vocabulary", slug: "vocabulary", description: "Word meanings and usage" },
  ];

  const historyTopics = [
    { name: "Ancient History", slug: "ancient-history", description: "Civilizations before 500 AD" },
    { name: "Medieval History", slug: "medieval-history", description: "500-1500 AD" },
    { name: "Modern History", slug: "modern-history", description: "1500 AD to present" },
  ];

  let topicCount = 0;

  for (const [subjectSlug, topics] of [
    ["mathematics", mathTopics],
    ["science", scienceTopics],
    ["english", englishTopics],
    ["history", historyTopics],
  ] as const) {
    const subject = subjects.find((s) => s.slug === subjectSlug);
    if (!subject) continue;

    for (let i = 0; i < topics.length; i++) {
      await prisma.topic.upsert({
        where: { subjectId_slug: { subjectId: subject.id, slug: topics[i].slug } },
        update: {},
        create: {
          subjectId: subject.id,
          name: topics[i].name,
          slug: topics[i].slug,
          description: topics[i].description,
          sortOrder: i + 1,
        },
      });
      topicCount++;
    }
  }

  console.log(`Created ${topicCount} topics`);
  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
