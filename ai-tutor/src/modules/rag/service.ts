import { prisma } from "@/lib/db";
import { getAIProvider } from "@/modules/ai-providers";
import type { AIMessage } from "@/modules/ai-providers";

export interface RagSource {
  /** The [Sn] marker exactly as it appears in the answer text. */
  ref: number;
  id: string;
  documentId: string;
  title: string;
  chunkIndex: number;
  similarity: number;
  snippet: string;
}

export interface GroundedAnswer {
  answer: string;
  sources: RagSource[];
  /** True when the model actually cited at least one source. */
  grounded: boolean;
  /** Chunks retrieval considered, including ones dropped as weak matches. */
  usedDocuments: number;
}

const DEFAULT_SOURCE_LIMIT = 6;
const SNIPPET_LENGTH = 400;

// Cosine similarity above which a chunk is treated as genuinely on-topic.
const MIN_SIMILARITY = 0.2;

const CITATION_PATTERN = /\[S(\d+)\]/g;

const NO_MATCH_ANSWER =
  "I could not find anything in your uploaded documents that answers this. Try rephrasing the question, or upload a document that covers this topic.";

const GROUNDED_SYSTEM_PROMPT = `You are a careful study assistant. Answer using ONLY the numbered source excerpts you are given.

Rules:
- Cite every claim with its source number in square brackets, for example [S1] or [S2][S5].
- Never cite a source number that does not appear in the excerpts.
- If the excerpts do not contain the answer, say what is missing. Do not answer from outside knowledge.
- Quote exact figures, definitions and terminology from the sources rather than paraphrasing loosely.
- Be concise and study-focused.`;

export class RAGService {
  async retrieveRelevantChunks(userId: string, query: string, limit: number = 5) {
    const readyCount = await prisma.document.count({
      where: { userId, status: "READY" },
    });
    if (readyCount === 0) return [];

    const provider = getAIProvider();
    const embedding = await provider.embed(query);
    const queryVector = `[${embedding.join(",")}]`;

    const chunks = await prisma.$queryRaw`
      SELECT dc.id, dc."documentId", dc.content, dc.metadata, dc."chunkIndex",
             d.filename, d."originalName",
             1 - (dc.embedding <=> ${queryVector}::vector) as similarity
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE d."userId" = ${userId}
        AND d.status = 'READY'
        AND dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> ${queryVector}::vector
      LIMIT ${limit}
    ` as Array<{
      id: string;
      documentId: string;
      content: string;
      metadata: unknown;
      chunkIndex: number;
      filename: string;
      originalName: string;
      similarity: number;
    }>;

    return chunks;
  }

  async buildContext(userId: string, query: string): Promise<string> {
    const chunks = await this.retrieveRelevantChunks(userId, query);

    if (chunks.length === 0) return "";

    const context = chunks
      .map(
        (c, i) =>
          `[Source ${i + 1}: ${c.originalName}]\n${c.content}`
      )
      .join("\n\n---\n\n");

    return `\n\nRelevant document context:\n${context}`;
  }

  async ask(
    userId: string,
    query: string,
    options: { limit?: number; history?: AIMessage[] } = {}
  ): Promise<GroundedAnswer> {
    const chunks = await this.retrieveRelevantChunks(
      userId,
      query,
      options.limit ?? DEFAULT_SOURCE_LIMIT
    );

    // A vector search ALWAYS returns the nearest rows, even when none of them
    // are actually about the question. Feeding those to the model would let it
    // cite an unrelated document, so weak matches are discarded up front.
    const usable = chunks.filter((c) => c.similarity >= MIN_SIMILARITY);

    if (usable.length === 0) {
      return {
        answer: NO_MATCH_ANSWER,
        sources: [],
        grounded: false,
        usedDocuments: chunks.length,
      };
    }

    const blocks = usable
      .map(
        (c, i) =>
          `[S${i + 1}] ${c.originalName} (part ${c.chunkIndex + 1})\n${c.content}`
      )
      .join("\n\n");

    const provider = getAIProvider();
    const answer = await provider.chat({
      messages: [
        { role: "system", content: GROUNDED_SYSTEM_PROMPT },
        ...(options.history ?? []),
        {
          role: "user",
          content: `Source excerpts:\n\n${blocks}\n\n---\n\nQuestion: ${query}`,
        },
      ],
      temperature: 0.2,
    });

    const cited = new Set<number>();
    for (const match of answer.matchAll(CITATION_PATTERN)) {
      const n = Number(match[1]);
      if (n >= 1 && n <= usable.length) cited.add(n);
    }

    const sources = [...cited]
      .sort((a, b) => a - b)
      .map((n) => {
        const c = usable[n - 1];
        return {
          ref: n,
          id: c.id,
          documentId: c.documentId,
          title: c.originalName,
          chunkIndex: c.chunkIndex,
          similarity: Number(c.similarity),
          snippet: c.content.slice(0, SNIPPET_LENGTH),
        };
      });

    return {
      answer,
      sources,
      grounded: sources.length > 0,
      usedDocuments: chunks.length,
    };
  }
}

export const ragService = new RAGService();
