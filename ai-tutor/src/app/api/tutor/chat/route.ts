import { auth } from "@/lib/auth";
import { tutorService } from "@/modules/tutor/service";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = session.user.id;

  try {
    const { message, conversationId } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (message.length > 10000) {
      return new Response(JSON.stringify({ error: "Message too long" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of tutorService.chatStream(
            userId,
            message.trim(),
            conversationId || undefined
          )) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          }
          controller.close();
        } catch (error) {
          console.error("Tutor stream error:", error);
          const errText = `${
            error instanceof Error ? error.message : ""
          } ${
            typeof (error as { responseBody?: unknown })?.responseBody ===
            "string"
              ? (error as { responseBody?: string }).responseBody
              : ""
          }`;
          const userMessage = /429|RESOURCE_EXHAUSTED|quota/i.test(errText)
            ? "All available AI models have hit their free daily limits. Quotas reset at midnight Pacific Time - or enable billing on your Gemini API key / set GEMINI_FALLBACK_MODEL in .env to another available model."
            : "Failed to process your message.";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", content: userMessage })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Tutor chat error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process your message. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
