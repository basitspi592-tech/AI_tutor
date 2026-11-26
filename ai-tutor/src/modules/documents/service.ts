import { prisma } from "@/lib/db";
import path from "path" /*turbopackIgnore: true*/;
import fs from "fs/promises";
import { getAIProvider } from "@/modules/ai-providers";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024;

export class DocumentService {
  async uploadDocument(userId: string, file: File) {
    if (file.size > MAX_SIZE) {
      throw new Error("File too large");
    }

    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Unsupported file type");
    }

    const userDir = path.join(UPLOAD_DIR, userId);
    await fs.mkdir(userDir, { recursive: true });

    const id = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "bin";
    const filename = `${id}.${ext}`;
    const storagePath = path.join(userDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(storagePath, buffer);

    const document = await prisma.document.create({
      data: {
        userId,
        filename,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        storagePath,
        status: "PENDING",
      },
    });

    this.processDocument(document.id, storagePath, file.type).catch((err) => {
      console.error("Document processing error:", err);
    });

    return document;
  }

  async processDocument(documentId: string, filePath: string, mimeType: string) {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "PROCESSING" },
    });

    try {
      let text = "";
      const provider = getAIProvider();

      if (mimeType === "text/plain") {
        text = await fs.readFile(filePath, "utf-8");
      } else if (mimeType === "application/pdf") {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const buffer = await fs.readFile(filePath);
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const result = await extractText(pdf, { mergePages: true });
        text = result.text;

        // Scanned/image-based PDFs yield little or no selectable text.
        // Fall back to Gemini's native vision reading of the PDF pages.
        if (text.trim().length < 200) {
          try {
            console.log(
              `PDF ${documentId}: only ${text.trim().length} chars extracted via unpdf, trying Gemini vision extraction`
            );
            const visionText = await provider.extractFromPdf(buffer);
            if (visionText.trim().length > text.trim().length) {
              text = visionText;
            }
          } catch (err) {
            console.error(
              `Gemini PDF vision extraction failed for ${documentId}:`,
              err
            );
          }
        }
      } else if (
        mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value;
      }

      if (!text.trim()) {
        throw new Error("No extractable text found in document");
      }

      const chunks = this.chunkText(text, 1000, 200);
      const embeddings = await provider.embedBatch(chunks);

      for (let i = 0; i < chunks.length; i++) {
        const chunkId = crypto.randomUUID();
        const embeddingStr = `[${embeddings[i].join(",")}]`;
        await prisma.$executeRaw`
          INSERT INTO "DocumentChunk" (id, "documentId", content, embedding, "chunkIndex", "tokenCount", "createdAt")
          VALUES (${chunkId}, ${documentId}, ${chunks[i]}, ${embeddingStr}::vector, ${i}, ${Math.ceil(chunks[i].length / 4)}, NOW())
        `;
      }

      await prisma.document.update({
        where: { id: documentId },
        data: { status: "READY", processedAt: new Date() },
      });
    } catch (error) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "ERROR",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - overlap;
      if (start + overlap >= text.length) break;
    }

    return chunks;
  }

  async getUserDocuments(userId: string) {
    return prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        createdAt: true,
        processedAt: true,
      },
    });
  }

  async deleteDocument(userId: string, documentId: string) {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!doc) throw new Error("Document not found");

    try {
      await fs.unlink(doc.storagePath);
    } catch {}

    await prisma.document.delete({ where: { id: documentId } });
  }
}

export const documentService = new DocumentService();
