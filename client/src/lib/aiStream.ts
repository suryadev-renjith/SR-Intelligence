export type StreamMode = "chatbot" | "tutor" | "writing";

export type StreamMessage = {
  role: "user" | "assistant";
  content: string;
};

type StreamOptions = {
  messages: StreamMessage[];
  mode: StreamMode;
  saveToHistory?: boolean;
  onDelta: (delta: string) => void;
};

/**
 * Reads the server-sent event stream and forwards each text delta immediately
 * to the active chat surface. This avoids waiting for the full answer body.
 */
export async function streamAiResponse({
  messages,
  mode,
  saveToHistory = true,
  onDelta,
}: StreamOptions): Promise<string> {
  const response = await fetch("/api/ai/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ messages, mode, saveToHistory }),
  });

  if (!response.ok) {
    let message = `AI request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error || message;
    } catch {
      // Keep the useful status-based fallback.
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("The AI response stream is unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completeText = "";

  const consumeLine = (line: string) => {
    if (!line.startsWith("data:")) return false;
    const data = line.slice(5).trim();
    if (!data) return false;
    if (data === "[DONE]") return true;

    const event = JSON.parse(data) as { delta?: string; error?: string };
    if (event.error) throw new Error(event.error);
    if (event.delta) {
      completeText += event.delta;
      onDelta(event.delta);
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
      finished = consumeLine(line) || finished;
    }
    if (finished || done) break;
  }

  return completeText;
}
