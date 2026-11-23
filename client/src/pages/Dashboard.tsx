import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import MessageDisplay from "@/components/MessageDisplay";
import { MessageCircle, BookOpen, PenTool, LogOut, History as HistoryIcon } from "lucide-react";
import { useLocation } from "wouter";
import { streamAiResponse } from "@/lib/aiStream";

type FeatureType = "chatbot" | "tutor" | "writing" | null;

export default function Dashboard() {
  const { user, logout, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedFeature, setSelectedFeature] = useState<FeatureType>(null);

  // Redirect unauthenticated users to home
  if (!loading && !isAuthenticated) {
    setLocation("/");
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const features = [
    {
      id: "chatbot",
      title: "Chatbot",
      description: "Chat with an AI assistant for general questions",
      icon: MessageCircle,
      color: "from-blue-500 to-blue-600",
    },
    {
      id: "tutor",
      title: "Tutor",
      description: "Get help learning new concepts and subjects",
      icon: BookOpen,
      color: "from-purple-500 to-purple-600",
    },
    {
      id: "writing",
      title: "Writing Assistant",
      description: "Improve your writing with AI feedback",
      icon: PenTool,
      color: "from-green-500 to-green-600",
    },
  ];

  if (selectedFeature) {
    return (
      <ChatInterface
        feature={selectedFeature}
        onBack={() => setSelectedFeature(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 md:px-12 md:py-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <img
            src="/manus-storage/sr-ai-logo_357a9169.png"
            alt="SR AI logo"
            className="w-10 h-10 rounded-lg object-cover"
          />
          <span className="text-white font-bold text-xl">SR AI</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-gray-300 text-sm">{user?.name || user?.email}</span>
          <Button
            onClick={() => setLocation("/history")}
            variant="outline"
            className="text-white border-gray-600 hover:bg-gray-800 gap-2"
          >
            <HistoryIcon className="w-4 h-4" />
            History
          </Button>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="text-white border-gray-600 hover:bg-gray-800"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-12 md:px-12 md:py-16">
        <div className="max-w-6xl mx-auto">
          {/* Welcome Section */}
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Welcome to SR AI
            </h1>
            <p className="text-xl text-gray-400">
              Choose an AI tool to get started
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.id}
                  className="bg-gray-900 border-gray-800 hover:border-blue-500 transition-all cursor-pointer group"
                  onClick={() => setSelectedFeature(feature.id as FeatureType)}
                >
                  <div className="p-6">
                    <div
                      className={`w-16 h-16 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                    >
                      <Icon className="w-8 h-8 text-white" />
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-gray-400 mb-6">{feature.description}</p>

                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                      Open
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-500 text-sm border-t border-gray-800 mt-12">
        <p>By Suryadev Renjith</p>
      </footer>
    </div>
  );
}

function ChatInterface({
  feature,
  onBack,
}: {
  feature: FeatureType;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const featureNames: Record<string, string> = {
    chatbot: "Chatbot",
    tutor: "Tutor",
    writing: "Writing Assistant",
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user" as const, content: input };
    const conversationMessages = [...messages, userMessage];
    setMessages([
      ...conversationMessages,
      { role: "assistant" as const, content: "" },
    ]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      await streamAiResponse({
        messages: conversationMessages,
        mode: feature as "chatbot" | "tutor" | "writing",
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
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred";
      setError(errorMsg);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === "assistant" && !last.content
          ? prev.slice(0, -1)
          : prev;
      });
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 md:px-12 md:py-6 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <Button
            onClick={onBack}
            variant="outline"
            className="text-white border-gray-600 hover:bg-gray-800"
          >
            ← Back
          </Button>
          <h1 className="text-2xl font-bold text-white">
            {feature && featureNames[feature as string]}
          </h1>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded mx-6 md:mx-12 mt-4">
          <div className="flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-100 hover:text-red-50"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-12">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-12">
              <p className="text-lg">Start a conversation</p>
              <p className="text-sm">Ask anything and get instant responses</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-100"
                }`}
              >
                {msg.role === "assistant" ? (
                  <MessageDisplay content={msg.content} role="assistant" />
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 text-gray-100 px-4 py-3 rounded-lg">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-800 px-6 py-6 md:px-12">
        <div className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type your message..."
            className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
