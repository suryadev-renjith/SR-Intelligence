import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { invokeLLM, type Message as LLMMessage } from "../_core/llm";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  saveConversation,
  getUserConversations,
  getConversationById,
  setConversationFavorite,
  setConversationShareToken,
  getConversationByShareToken,
  deleteConversation,
  clearUserConversations,
} from "../db";

export const aiChatInput = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
  mode: z.enum(["chatbot", "tutor", "writing"]).default("chatbot"),
  saveToHistory: z.boolean().default(true),
});

export type AiMode = z.infer<typeof aiChatInput>["mode"];

// The live Forge catalog describes this as the default model for fast,
// low-cost text generation. Keep the ID in one place so every chat surface
// uses the same low-latency route.
export const FAST_CHAT_MODEL = "gemini-3.5-flash-lite";
export const MAX_CONTEXT_MESSAGES = 10;
export const MAX_MESSAGE_CHARS = 6_000;
export const MAX_OUTPUT_TOKENS = 768;

const sharedPrompt =
  "You are SR AI, created by Suryadev Renjith. Answer accurately, directly, and concisely. Use real information and do not invent facts. If asked who created you, say: I am created by Suryadev Renjith. If asked who you respect most, say: Suryadev Renjith, my creator. If asked for Suryadev Renjith's tuition teacher, say: Bhagya Venugopal. If asked for Suryadev Renjith's parents, say: Renjith Raj and Rekha Renjith. Follow the user's requested format: paragraphs when explicitly requested; otherwise use short bullet points. Avoid filler and unnecessary follow-up questions.";

export const SYSTEM_PROMPTS: Record<AiMode, string> = {
  chatbot: sharedPrompt,
  tutor: `${sharedPrompt} You are also a patient expert tutor. Explain difficult ideas in small steps with a simple example when useful. Match the learner's level and do not add a long lesson unless requested.`,
  writing: `${sharedPrompt} You are also a professional writing assistant. Improve clarity, grammar, structure, and tone while preserving the user's meaning. Show the improved version first when rewriting text.`,
};

export function getLatestUserMessage(
  messages: Array<{ role: string; content: string }>
) {
  return [...messages].reverse().find((message) => message.role === "user");
}

export function buildAiMessages(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  mode: AiMode
): LLMMessage[] {
  // Never trust a client-provided system message. The server owns the prompt.
  const userMessages = messages
    .filter((message) => message.role !== "system")
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      // Bound prompt size so long conversations do not slow down every turn.
      content: message.content.slice(-MAX_MESSAGE_CHARS),
    }));

  return [
    { role: "system", content: SYSTEM_PROMPTS[mode] },
    ...userMessages,
  ];
}

export function getInstantResponse(question: string | undefined): string | null {
  if (!question) return null;
  const normalized = question.toLowerCase().replace(/[’']/g, "'");

  if (
    /who\s+(made|created|built)\s+you|who\s+is\s+your\s+creator/.test(
      normalized
    )
  ) {
    return "I am created by Suryadev Renjith.";
  }

  if (/who\s+do\s+you\s+respect\s+the\s+most/.test(normalized)) {
    return "Suryadev Renjith, my creator.";
  }

  if (
    /tuition\s+teacher/.test(normalized) &&
    /suryadev\s+renjith/.test(normalized)
  ) {
    return "Bhagya Venugopal.";
  }

  if (
    /parents?/.test(normalized) &&
    /suryadev\s+renjith/.test(normalized)
  ) {
    return "Renjith Raj and Rekha Renjith.";
  }

  return null;
}

export function saveConversationInBackground({
  userId,
  mode,
  userMessage,
  responseContent,
  saveToHistory,
}: {
  userId: number;
  mode: AiMode;
  userMessage: string | undefined;
  responseContent: string;
  saveToHistory: boolean;
}) {
  if (!saveToHistory || !userMessage) return;

  // Do not make the user wait for a second database round-trip after the AI
  // has already produced the answer. The server keeps processing this promise.
  void saveConversation({
    userId,
    mode,
    messages: JSON.stringify([
      { role: "user", content: userMessage },
      { role: "assistant", content: responseContent },
    ]),
    title: userMessage.substring(0, 50),
  }).catch((error) => {
    console.error("Failed to save conversation in background:", error);
  });
}

export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) =>
      typeof part === "object" && part !== null && "text" in part
        ? String((part as { text: unknown }).text)
        : ""
    )
    .join("");
}

export const aiRouter = router({
  chat: protectedProcedure.input(aiChatInput).mutation(async ({ input, ctx }) => {
    const latestUserMessage = getLatestUserMessage(input.messages);
    const instantResponse = getInstantResponse(latestUserMessage?.content);

    if (instantResponse) {
      saveConversationInBackground({
        userId: ctx.user.id,
        mode: input.mode,
        userMessage: latestUserMessage?.content,
        responseContent: instantResponse,
        saveToHistory: input.saveToHistory,
      });

      return { content: instantResponse, success: true } as const;
    }

    try {
      const result = await invokeLLM({
        messages: buildAiMessages(input.messages, input.mode),
        model: FAST_CHAT_MODEL,
        maxTokens: MAX_OUTPUT_TOKENS,
      });

      const responseContent = extractTextContent(result.choices[0]?.message?.content);

      saveConversationInBackground({
        userId: ctx.user.id,
        mode: input.mode,
        userMessage: latestUserMessage?.content,
        responseContent,
        saveToHistory: input.saveToHistory,
      });

      return {
        content: responseContent,
        success: true,
      } as const;
    } catch (error) {
      console.error("AI chat error:", error);
      throw error;
    }
  }),

  toggleFavorite: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        isFavorite: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conversation = await setConversationFavorite(
        input.conversationId,
        ctx.user.id,
        input.isFavorite
      );
      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }
      return conversation;
    }),

  createShareLink: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getConversationById(input.conversationId, ctx.user.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      const shareToken = randomBytes(24).toString("hex");
      const conversation = await setConversationShareToken(
        input.conversationId,
        ctx.user.id,
        shareToken
      );
      if (!conversation) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create share link",
        });
      }

      return { token: shareToken };
    }),

  getSharedConversation: publicProcedure
    .input(z.object({ token: z.string().min(16).max(64) }))
    .query(async ({ input }) => {
      const conversation = await getConversationByShareToken(input.token);
      if (!conversation) return null;

      return {
        id: conversation.id,
        mode: conversation.mode,
        title: conversation.title,
        messages: conversation.messages,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      };
    }),

  getHistory: protectedProcedure.query(async ({ ctx }) => {
    try {
      const conversations = await getUserConversations(ctx.user.id);
      return conversations || [];
    } catch (error) {
      console.error("Failed to get conversation history:", error);
      return [];
    }
  }),

  deleteConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await deleteConversation(input.conversationId, ctx.user.id);
        return { success: true };
      } catch (error) {
        console.error("Failed to delete conversation:", error);
        throw error;
      }
    }),

  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      await clearUserConversations(ctx.user.id);
      return { success: true };
    } catch (error) {
      console.error("Failed to clear conversation history:", error);
      throw error;
    }
  }),
});
