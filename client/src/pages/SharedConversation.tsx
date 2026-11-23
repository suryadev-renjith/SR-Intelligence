import { useRoute } from "wouter";
import { Card } from "@/components/ui/card";
import MessageDisplay from "@/components/MessageDisplay";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

type SharedMessage = { role: "user" | "assistant"; content: string };

function parseMessages(messages: string): SharedMessage[] {
  try {
    const parsed = JSON.parse(messages);
    return Array.isArray(parsed)
      ? parsed.filter(
          (message): message is SharedMessage =>
            (message?.role === "user" || message?.role === "assistant") &&
            typeof message?.content === "string"
        )
      : [];
  } catch {
    return [];
  }
}

export default function SharedConversation() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token || "";
  const { data, isLoading } = trpc.ai.getSharedConversation.useQuery(
    { token },
    { enabled: token.length > 0 }
  );

  if (isLoading) {
    return <div className="min-h-screen bg-slate-950 text-gray-300 flex items-center justify-center">Loading shared conversation...</div>;
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-gray-300 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Share2 className="w-10 h-10 text-gray-500" />
        <h1 className="text-2xl font-bold text-white">Conversation not found</h1>
        <p>This share link may be invalid or no longer available.</p>
        <Button onClick={() => (window.location.href = "/")} className="bg-blue-600 hover:bg-blue-700">Open SR AI</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-sm text-blue-300 uppercase tracking-wider">Shared SR AI conversation</p>
            <h1 className="text-3xl font-bold text-white mt-2">{data.title}</h1>
            <p className="text-sm text-gray-400 mt-2 capitalize">{data.mode}</p>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/")} className="text-white border-gray-600 hover:bg-gray-800 shrink-0">
            <ArrowLeft className="w-4 h-4 mr-2" /> SR AI
          </Button>
        </div>

        <Card className="bg-slate-900/90 border-slate-700 p-5 space-y-5">
          {parseMessages(data.messages).map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-3xl rounded-xl px-4 py-3 ${message.role === "user" ? "bg-blue-600 text-white" : "bg-slate-800 text-gray-100 border border-slate-700"}`}>
                <MessageDisplay content={message.content} role={message.role} />
              </div>
            </div>
          ))}
        </Card>
        <p className="text-center text-gray-500 text-sm mt-6">By Suryadev Renjith</p>
      </div>
    </div>
  );
}
