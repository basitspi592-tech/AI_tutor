import { prisma } from "@/lib/db";
import { getAIProvider } from "@/modules/ai-providers";
import type { AIMessage } from "@/modules/ai-providers";
import { ragService } from "@/modules/rag/service";

const SYSTEM_PROMPT = `You are an AI Tutor, a helpful and educational assistant. Your role is to help students learn effectively by:
1. Explaining concepts clearly and step by step
2. Using examples and analogies
3. Asking follow-up questions to check understanding
4. Providing hints rather than direct answers when appropriate
5. Adapting to the student's level
6. Being encouraging and supportive

When the student asks a question:
- First assess their understanding
- Provide a clear explanation
- Give an example
- Ask if they understand or want more clarification

Keep responses educational but concise. Use markdown formatting when helpful.`;

export class TutorService {
  private async prepareConversation(
    userId: string,
    message: string,
    conversationId?: string
  ) {
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
      });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          title: message.slice(0, 100),
        },
        include: { messages: true },
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: message,
      },
    });

    let systemContent = SYSTEM_PROMPT;
    try {
      const docContext = await ragService.buildContext(userId, message);
      if (docContext) {
        systemContent = `${SYSTEM_PROMPT}${docContext}

When answering, ground your response in the document excerpts above whenever they are relevant, and mention which source document(s) you used. If the excerpts are not relevant to the question, ignore them and answer normally with your own knowledge.`;
      }
    } catch (err) {
      console.error("RAG context retrieval failed:", err);
    }

    const history: AIMessage[] = [
      { role: "system", content: systemContent },
      ...conversation.messages.map((m) => ({
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    return { conversation, history };
  }

  private async saveReply(
    userId: string,
    conversationId: string,
    reply: string,
    provider: { id: string },
    latencyMs: number,
    requestTokens: number
  ) {
    await Promise.all([
      prisma.message.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: reply,
          tokensUsed: Math.ceil(reply.length / 4),
        },
      }),
      prisma.aiUsage.create({
        data: {
          userId,
          provider: provider.id,
          model: "gemini-3.6-flash",
          requestTokens,
          responseTokens: Math.ceil(reply.length / 4),
          estimatedCost: 0,
          feature: "tutor-chat",
          latencyMs,
        },
      }),
    ]);
  }

  async chat(
    userId: string,
    message: string,
    conversationId?: string
  ): Promise<{ reply: string; conversationId: string }> {
    const provider = getAIProvider();
    const { conversation, history } = await this.prepareConversation(
      userId,
      message,
      conversationId
    );

    const startTime = Date.now();
    const reply = await provider.chat({ messages: history });
    const latencyMs = Date.now() - startTime;

    this.saveReply(
      userId,
      conversation.id,
      reply,
      provider,
      latencyMs,
      Math.ceil(message.length / 4)
    ).catch(console.error);

    return { reply, conversationId: conversation.id };
  }

  async *chatStream(
    userId: string,
    message: string,
    conversationId?: string
  ): AsyncIterable<{
    type: "chunk" | "done";
    content: string;
    conversationId: string;
  }> {
    const provider = getAIProvider();
    const { conversation, history } = await this.prepareConversation(
      userId,
      message,
      conversationId
    );

    const startTime = Date.now();
    let fullReply = "";

    for await (const chunk of provider.chatStream({ messages: history })) {
      fullReply += chunk;
      yield { type: "chunk", content: chunk, conversationId: conversation.id };
    }

    const latencyMs = Date.now() - startTime;
    this.saveReply(
      userId,
      conversation.id,
      fullReply,
      provider,
      latencyMs,
      Math.ceil(message.length / 4)
    ).catch(console.error);

    yield { type: "done", content: "", conversationId: conversation.id };
  }

  async getConversations(userId: string) {
    return prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getConversationWithMessages(userId: string, conversationId: string) {
    return prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  async deleteConversation(userId: string, conversationId: string) {
    return prisma.conversation.deleteMany({
      where: { id: conversationId, userId },
    });
  }
}

export const tutorService = new TutorService();
