import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Mic, Volume2, X, Loader, Volume, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import MessageDisplay from "./MessageDisplay";
import { streamAiResponse } from "@/lib/aiStream";

type Message = {
  role: "user" | "assistant";
  content: string;
};

interface ChatInterfaceProps {
  mode: "chatbot" | "tutor" | "writing";
  onClose: () => void;
}

export default function ChatInterface({ mode, onClose }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onstart = () => {
        setIsTranscribing(true);
      };

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            setInput((prev) => prev + transcript);
          } else {
            interimTranscript += transcript;
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        toast.error(`Speech recognition error: ${event.error}`);
        setIsTranscribing(false);
      };

      recognitionRef.current.onend = () => {
        setIsTranscribing(false);
      };
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const speakText = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  const copyToClipboard = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    const conversationMessages = [...messages, userMessage];
    setMessages([
      ...conversationMessages,
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setIsStreaming(true);

    try {
      const responseContent = await streamAiResponse({
        messages: conversationMessages,
        mode,
        onDelta: (delta) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: last.content + delta,
              };
            }
            return next;
          });
        },
      });

      // Speak the response if voice mode is enabled
      if (isVoiceMode) {
        speakText(responseContent);
      }
    } catch (error) {
      toast.error("Failed to get response");
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === "assistant" && !last.content
          ? prev.slice(0, -1)
          : prev;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl h-[600px] bg-slate-900 border-slate-700 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white capitalize">{mode}</h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isVoiceMode ? "default" : "outline"}
              onClick={() => setIsVoiceMode(!isVoiceMode)}
              className="gap-2"
              title="Toggle voice output for AI responses"
            >
              <Volume2 className="w-4 h-4" />
              Voice
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p>Start a conversation...</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-gray-100 border border-slate-700"
                  }`}
                >
                  <MessageDisplay content={msg.content} role={msg.role} />
                </div>
                {msg.role === "assistant" && (
                  <div className="flex gap-1 self-center">
                    <button
                      onClick={() => speakText(msg.content)}
                      className="text-gray-400 hover:text-white transition-colors p-1"
                      title="Read aloud"
                    >
                      <Volume className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => copyToClipboard(msg.content, idx)}
                      className="text-gray-400 hover:text-white transition-colors p-1"
                      title="Copy to clipboard"
                    >
                      {copiedIdx === idx ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-slate-700 p-4 space-y-3">
          {isSpeaking && (
            <div className="text-sm text-blue-400 text-center">
              🔊 AI is speaking...
            </div>
          )}
          {isTranscribing && (
            <div className="text-sm text-green-400 text-center">
              🎤 Listening...
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !isTranscribing) handleSendMessage();
              }}
              placeholder="Type or use voice..."
              className="bg-slate-800 border-slate-600 text-white placeholder-gray-400"
              disabled={isStreaming || isTranscribing}
            />
            <Button
              onClick={handleSendMessage}
              disabled={isStreaming || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isStreaming ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Voice Input Button */}
          <Button
            onClick={isTranscribing ? stopVoiceInput : startVoiceInput}
            variant={isTranscribing ? "destructive" : "outline"}
            className="w-full gap-2"
            disabled={!recognitionRef.current}
          >
            <Mic className="w-4 h-4" />
            {isTranscribing ? "Stop Recording" : "Voice Input"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
