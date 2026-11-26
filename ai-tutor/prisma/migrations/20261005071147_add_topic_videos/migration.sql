-- CreateEnum
CREATE TYPE "TopicVideoStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'ERROR');

-- CreateTable
CREATE TABLE "TopicVideo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" "TopicVideoStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "script" TEXT,
    "sections" JSONB,
    "sources" JSONB,
    "audioPath" TEXT,
    "videoPath" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicVideo_userId_idx" ON "TopicVideo"("userId");

-- CreateIndex
CREATE INDEX "TopicVideo_status_idx" ON "TopicVideo"("status");

-- AddForeignKey
ALTER TABLE "TopicVideo" ADD CONSTRAINT "TopicVideo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
