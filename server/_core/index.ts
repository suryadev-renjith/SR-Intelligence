import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { sdk } from "./sdk";
import { streamLLM } from "./llm";
import {
  aiChatInput,
  buildAiMessages,
  FAST_CHAT_MODEL,
  getInstantResponse,
  getLatestUserMessage,
  MAX_OUTPUT_TOKENS,
  saveConversationInBackground,
  extractTextContent,
} from "../routers/ai";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // Stream tokens directly to the chat UI so users see the answer start as
  // soon as the model produces it instead of waiting for the full completion.
  app.post("/api/ai/stream", async (req, res) => {
    const parsed = aiChatInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid chat request" });
      return;
    }

    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const input = parsed.data;
    const latestUserMessage = getLatestUserMessage(input.messages);
    const instantResponse = getInstantResponse(latestUserMessage?.content);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    if (instantResponse) {
      res.write(`data: ${JSON.stringify({ delta: instantResponse })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      saveConversationInBackground({
        userId: user.id,
        mode: input.mode,
        userMessage: latestUserMessage?.content,
        responseContent: instantResponse,
        saveToHistory: input.saveToHistory,
      });
      return;
    }

    try {
      const upstream = await streamLLM({
        messages: buildAiMessages(input.messages, input.mode),
        model: FAST_CHAT_MODEL,
        maxTokens: MAX_OUTPUT_TOKENS,
        stream: true,
      });

      if (!upstream.body) {
        throw new Error("The AI provider did not return a stream");
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let responseContent = "";

      const sendChunk = (line: string) => {
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") return data === "[DONE]";

        try {
          const event = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: unknown };
              message?: { content?: unknown };
            }>;
          };
          const choice = event.choices?.[0];
          const delta = extractTextContent(choice?.delta?.content);
          const fallback = extractTextContent(choice?.message?.content);
          const text = delta || fallback;
          if (text) {
            responseContent += text;
            res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
          }
        } catch {
          // Ignore incomplete or provider-specific SSE events.
        }
        return false;
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let finished = false;
        for (const line of lines) {
          if (line.startsWith("data:")) finished = sendChunk(line) || finished;
        }
        if (finished || done) break;
      }

      res.write("data: [DONE]\n\n");
      res.end();
      saveConversationInBackground({
        userId: user.id,
        mode: input.mode,
        userMessage: latestUserMessage?.content,
        responseContent,
        saveToHistory: input.saveToHistory,
      });
    } catch (error) {
      console.error("AI stream error:", error);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: "AI response failed" })}\n\n`);
        res.end();
      }
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
