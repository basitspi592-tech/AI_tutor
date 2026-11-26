-- CreateTable
CREATE TABLE "Notebook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lmId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookSource" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "lmId" TEXT NOT NULL,
    "title" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'unknown',
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotebookSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookArtifact" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "lmId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "content" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotebookArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notebook_userId_idx" ON "Notebook"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Notebook_userId_lmId_key" ON "Notebook"("userId", "lmId");

-- CreateIndex
CREATE INDEX "NotebookSource_notebookId_idx" ON "NotebookSource"("notebookId");

-- CreateIndex
CREATE UNIQUE INDEX "NotebookSource_notebookId_lmId_key" ON "NotebookSource"("notebookId", "lmId");

-- CreateIndex
CREATE INDEX "NotebookArtifact_notebookId_idx" ON "NotebookArtifact"("notebookId");

-- CreateIndex
CREATE UNIQUE INDEX "NotebookArtifact_notebookId_lmId_key" ON "NotebookArtifact"("notebookId", "lmId");

-- AddForeignKey
ALTER TABLE "Notebook" ADD CONSTRAINT "Notebook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookSource" ADD CONSTRAINT "NotebookSource_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookArtifact" ADD CONSTRAINT "NotebookArtifact_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
