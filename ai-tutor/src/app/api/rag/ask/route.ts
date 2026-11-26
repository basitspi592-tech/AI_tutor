import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ragService } from "@/modules/rag/service";

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  limit: z.number().int().min(1).max(12).optional(),
});

const QUOTA_HINT =
  "All available AI models have hit their free daily limits. Quotas reset at midnight Pacific Time - or enable billing on your Gemini API key / set GEMINI_FALLBACK_MODEL in .env to another available model.";

function quotaMessage(err: unknown): string {
  const e = err as { message?: string; responseBody?: unknown };
  const text = [
    e?.message,
    typeof e?.responseBody === "string" ? e.responseBody : "",
  ].join(" ");
  return /429|RESOURCE_EXHAUSTED|quota/i.test(text)
    ? QUOTA_HINT
    : "Failed to answer the question. Please try again.";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { question, limit } = parsed.data;

  try {
    const result = await ragService.ask(session.user.id, question, { limit });
    return NextResponse.json(result);
  } catch (err) {
    console.error("RAG ask error:", err);
    return NextResponse.json({ error: quotaMessage(err) }, { status: 502 });
  }
}