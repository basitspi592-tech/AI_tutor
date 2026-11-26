-- Self-hosted Notebooks: store source text/content for grounding generation.
ALTER TABLE "NotebookSource" ADD COLUMN "content" TEXT;
