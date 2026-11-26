import { generateText, streamText, embed } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { AIProvider, AIMessage } from "./types";

// Free-tier quotas are enforced PER MODEL, so listing several models
// gives the app multiple independent daily request buckets that are
// used in order when one runs out.
// IMPORTANT: every default here was live-tested against this API key -
// dead models (e.g. gemini-2.5-flash-lite) reject new projects with 404.
// Override via .env: GEMINI_PRIMARY_MODEL / GEMINI_FALLBACK_MODEL(_2/_3)
const CHAT_MODELS = [
  process.env.GEMINI_PRIMARY_MODEL || "gemini-3.5-flash-lite",
  process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash",
  process.env.GEMINI_FALLBACK_MODEL_2 || "gemini-3.7-flash",
  process.env.GEMINI_FALLBACK_MODEL_3 || "gemini-3.6-flash",
].filter(Boolean);

const EMBEDDING_MODEL = "gemini-embedding-001";

function errorText(err: unknown): string {
  const e = err as {
    message?: string;
    responseBody?: unknown;
    statusCode?: number;
    data?: { error?: { status?: string } };
  };
  return [
    e?.message,
    typeof e?.responseBody === "string" ? e.responseBody : "",
    e?.data?.error?.status,
    typeof e?.statusCode === "number" ? String(e.statusCode) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function isQuotaError(err: unknown): boolean {
  return /429|RESOURCE_EXHAUSTED|quota/i.test(errorText(err));
}

// Gemini streaming failures often arrive as an ERROR PART inside the
// stream instead of a thrown exception - textStream would then end
// with ZERO chunks as if nothing happened. Always consume fullStream.
interface FullStreamPart {
  type: string;
  text?: string;
  error?: unknown;
}

export class GeminiProvider implements AIProvider {
  id = "gemini";
  name = "Google Gemini";
  private client;

  constructor(apiKey?: string) {
    this.client = createGoogleGenerativeAI({
      apiKey: apiKey || process.env.GEMINI_API_KEY,
    });
  }

  private buildParams(params: {
    messages: AIMessage[];
    temperature?: number;
    maxTokens?: number;
  }) {
    const systemMsg = params.messages.find((m) => m.role === "system");
    const chatMsgs = params.messages.filter((m) => m.role !== "system");

    return {
      system: systemMsg?.content,
      messages: chatMsgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxTokens ?? 2048,
      maxRetries: 0,
    };
  }

  async chat(params: {
    messages: AIMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    let firstError: unknown = null;
    let lastError: unknown = null;

    for (const modelName of CHAT_MODELS) {
      try {
        const result = await generateText({
          ...this.buildParams(params),
          model: this.client(modelName),
        });
        if (result.text.trim().length > 0) return result.text;
        const emptyErr = new Error(`${modelName} returned empty text`);
        lastError = emptyErr;
        console.error(`[gemini] ${emptyErr.message}, trying next model`);
      } catch (err) {
        lastError = err;
        if (isQuotaError(err)) {
          firstError ??= err;
          console.warn(
            `[gemini] ${modelName} daily quota exhausted, trying next model`
          );
        } else {
          console.error(
            `[gemini] ${modelName} failed (${errorText(err).slice(0, 120)}), trying next model`
          );
        }
      }
    }

    throw firstError ?? lastError ?? new Error("No chat model available");
  }

  async *chatStream(params: {
    messages: AIMessage[];
    temperature?: number;
    maxTokens?: number;
  }): AsyncIterable<string> {
    let firstError: unknown = null;
    let lastError: unknown = null;

    for (const modelName of CHAT_MODELS) {
      let yieldedAny = false;
      try {
        const result = streamText({
          ...this.buildParams(params),
          model: this.client(modelName),
        });
        for await (const part of result.fullStream as AsyncIterable<FullStreamPart>) {
          if (part.type === "text-delta") {
            const text = part.text ?? "";
            if (!text) continue;
            yieldedAny = true;
            yield text;
          } else if (part.type === "error") {
            throw part.error ?? new Error(`${modelName} stream error`);
          }
        }
        // Stream closed cleanly but produced no text at all:
        // another way "dead/unavailable model" failures manifest.
        if (!yieldedAny) {
          throw Object.assign(
            new Error(`${modelName} returned an empty stream`),
            { emptyStream: true }
          );
        }
        return;
      } catch (err) {
        lastError = err;
        // Once chunks reached the user we cannot restart with another
        // model - the partial reply would be duplicated.
        if (yieldedAny) throw err;

        if (isQuotaError(err)) {
          firstError ??= err;
          console.warn(
            `[gemini] ${modelName} daily quota exhausted, trying next model`
          );
        } else {
          console.error(
            `[gemini] ${modelName} failed (${errorText(err).slice(0, 120)}), trying next model`
          );
        }
      }
    }

    throw firstError ?? lastError ?? new Error("No chat model available");
  }

  async embed(text: string): Promise<number[]> {
    const result = await embed({
      model: this.client.textEmbeddingModel(EMBEDDING_MODEL),
      value: text,
      providerOptions: { google: { outputDimensionality: 1536 } },
    });
    return result.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(
      texts.map((text) =>
        embed({
          model: this.client.textEmbeddingModel(EMBEDDING_MODEL),
          value: text,
          providerOptions: { google: { outputDimensionality: 1536 } },
        })
      )
    );
    return results.map((r) => r.embedding);
  }

  async extractFromPdf(buffer: Buffer): Promise<string> {
    let firstError: unknown = null;
    let lastError: unknown = null;

    for (const modelName of CHAT_MODELS) {
      try {
        const result = await generateText({
          model: this.client(modelName),
          maxRetries: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Transcribe ALL readable text from this PDF, page by page. This may be a scanned or image-based document - read every page carefully.
Rules:
- Preserve the original structure: headings, numbering (Task 1, Question 2, etc.), tables and lists.
- Include every question, task instruction, code snippet, formula and answer you can read.
- If a word is unreadable, write [unreadable] in its place.
- Do NOT summarize, do NOT add commentary. Output ONLY the transcription.`,
                },
                {
                  type: "file",
                  data: new Uint8Array(buffer),
                  mediaType: "application/pdf",
                },
              ],
            },
          ],
          temperature: 0.1,
          maxOutputTokens: 8192,
        });
        if (result.text.trim().length > 0) return result.text;
        const emptyErr = new Error(`${modelName} extracted empty text`);
        lastError = emptyErr;
        console.error(`[gemini] ${emptyErr.message}, trying next model`);
      } catch (err) {
        lastError = err;
        if (isQuotaError(err)) {
          firstError ??= err;
          console.warn(
            `[gemini] ${modelName} quota exhausted during PDF extraction, trying next model`
          );
        } else {
          console.error(
            `[gemini] ${modelName} PDF extraction failed, trying next model`
          );
        }
      }
    }

    throw firstError ?? lastError ?? new Error("PDF extraction failed on all models");
  }
}
