import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tutorService } from "@/modules/tutor/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await tutorService.getConversationWithMessages(
    session.user.id,
    id
  );

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = conversation.messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      id: m.id,
      role: m.role === "USER" ? "user" : "assistant",
      content: m.content,
    }));

  return NextResponse.json({
    conversationId: conversation.id,
    title: conversation.title,
    messages,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await tutorService.deleteConversation(session.user.id, id);
  return NextResponse.json({ ok: true });
}
