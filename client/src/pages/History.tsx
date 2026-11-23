import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Check,
  Download,
  Link2,
  Search,
  Star,
  Trash,
  Trash2,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

type HistoryConversation = {
  id: number;
  title: string;
  mode: string;
  messages: string;
  createdAt: Date | string;
  isFavorite?: boolean;
};

type StoredMessage = { role?: string; content?: string };

function parseMessages(messages: string): StoredMessage[] {
  try {
    const parsed = JSON.parse(messages);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function exportConversationAsPdf(conversation: HistoryConversation) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const textWidth = pageWidth - margin * 2;
  const lineHeight = 5.5;
  let y = margin;

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  pdf.setProperties({ title: conversation.title, subject: "SR AI conversation" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  const titleLines = pdf.splitTextToSize(conversation.title, textWidth);
  ensureSpace(titleLines.length * 8);
  pdf.text(titleLines, margin, y);
  y += titleLines.length * 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`${conversation.mode} · ${new Date(conversation.createdAt).toLocaleString()}`, margin, y);
  y += 12;
  pdf.setTextColor(23, 32, 51);

  for (const message of parseMessages(conversation.messages)) {
    const label = message.role === "user" ? "You" : "SR AI";
    const lines = pdf.splitTextToSize(message.content || "", textWidth);
    const blockHeight = 7 + Math.max(lines.length, 1) * lineHeight + 8;
    ensureSpace(blockHeight);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(label, margin, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(lines.length ? lines : [""], margin, y);
    y += Math.max(lines.length, 1) * lineHeight + 8;
  }

  const filename = `sr-ai-${conversation.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "conversation"}.pdf`;
  pdf.save(filename);
  toast.success("PDF downloaded");
}

export default function History() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "chatbot" | "tutor" | "writing">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { data: conversations = [], isLoading, refetch } = trpc.ai.getHistory.useQuery();
  const deleteHistoryMutation = trpc.ai.deleteConversation.useMutation();
  const clearAllMutation = trpc.ai.clearHistory.useMutation();
  const favoriteMutation = trpc.ai.toggleFavorite.useMutation();
  const shareMutation = trpc.ai.createShareLink.useMutation();

  const filteredConversations = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const startBoundary = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const endBoundary = endDate ? new Date(`${endDate}T23:59:59.999`) : null;

    return (conversations as HistoryConversation[]).filter((conv) => {
      const messages = parseMessages(conv.messages);
      const searchableContent = [
        conv.title,
        ...messages.map((message) => message.content || ""),
      ]
        .join(" ")
        .toLowerCase();
      const createdAt = new Date(conv.createdAt);
      const matchesSearch = !normalizedQuery || searchableContent.includes(normalizedQuery);
      const matchesMode = filterMode === "all" || conv.mode === filterMode;
      const matchesStart = !startBoundary || createdAt >= startBoundary;
      const matchesEnd = !endBoundary || createdAt <= endBoundary;
      const matchesFavorite = !favoritesOnly || Boolean(conv.isFavorite);
      return matchesSearch && matchesMode && matchesStart && matchesEnd && matchesFavorite;
    });
  }, [conversations, endDate, favoritesOnly, filterMode, searchQuery, startDate]);

  const handleDeleteConversation = async (conversationId: number) => {
    try {
      await deleteHistoryMutation.mutateAsync({ conversationId });
      toast.success("Conversation deleted");
      refetch();
    } catch {
      toast.error("Failed to delete conversation");
    }
  };

  const handleToggleFavorite = async (conversation: HistoryConversation) => {
    try {
      await favoriteMutation.mutateAsync({
        conversationId: conversation.id,
        isFavorite: !conversation.isFavorite,
      });
      toast.success(conversation.isFavorite ? "Removed from favorites" : "Added to favorites");
      refetch();
    } catch {
      toast.error("Failed to update favorite");
    }
  };

  const handleShare = async (conversationId: number) => {
    try {
      const result = await shareMutation.mutateAsync({ conversationId });
      const shareUrl = `${window.location.origin}/share/${result.token}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard");
    } catch {
      toast.error("Failed to create share link");
    }
  };

  const handleClearAll = async () => {
    if (window.confirm("Are you sure you want to delete all conversations?")) {
      try {
        await clearAllMutation.mutateAsync();
        toast.success("All conversations deleted");
        refetch();
      } catch {
        toast.error("Failed to clear history");
      }
    }
  };

  const formatDate = (date: Date | string) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")} className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h1 className="text-3xl font-bold text-white">Conversation History</h1>
          </div>
          {conversations.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleClearAll} disabled={clearAllMutation.isPending} className="gap-2">
              <Trash className="w-4 h-4" /> Clear All
            </Button>
          )}
        </div>

        {conversations.length > 0 && (
          <div className="mb-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <Input type="text" placeholder="Search titles and message content..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 pr-10 bg-slate-800 border-slate-600 text-white placeholder-gray-400" />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3 top-3 text-gray-400 hover:text-white" aria-label="Clear search"><X className="w-5 h-5" /></button>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm text-gray-400">From<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 px-3 py-2 text-white" /></label>
              <label className="text-sm text-gray-400">To<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 px-3 py-2 text-white" /></label>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {(["all", "chatbot", "tutor", "writing"] as const).map((mode) => (
                <Button key={mode} variant={filterMode === mode ? "default" : "outline"} size="sm" onClick={() => setFilterMode(mode)} className={filterMode === mode ? "bg-blue-600" : "border-slate-600 text-gray-300"}>
                  {mode === "all" ? "All" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Button>
              ))}
              <Button variant={favoritesOnly ? "default" : "outline"} size="sm" onClick={() => setFavoritesOnly((value) => !value)} className={favoritesOnly ? "bg-amber-600" : "border-slate-600 text-gray-300"}>
                <Star className="w-4 h-4 mr-1" /> Favorites
              </Button>
            </div>
            <p className="text-sm text-gray-400">Found {filteredConversations.length} of {conversations.length} conversations</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center text-gray-400">Loading history...</div>
        ) : conversations.length === 0 ? (
          <Card className="bg-slate-900 border-slate-700 p-8 text-center"><p className="text-gray-400">No conversations yet. Start chatting to build your history!</p></Card>
        ) : filteredConversations.length === 0 ? (
          <Card className="bg-slate-900 border-slate-700 p-8 text-center"><p className="text-gray-400">No conversations match your filters.</p></Card>
        ) : (
          <div className="space-y-4">
            {filteredConversations.map((conv) => (
              <Card key={conv.id} className="bg-slate-900 border-slate-700 p-4 hover:bg-slate-800 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-600 text-white capitalize">{conv.mode}</span>
                      <span className="text-sm text-gray-400">{formatDate(conv.createdAt)}</span>
                    </div>
                    <p className="text-white font-medium truncate">{conv.title}</p>
                    <p className="text-sm text-gray-400 mt-1">{parseMessages(conv.messages).length} messages</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleToggleFavorite(conv)} disabled={favoriteMutation.isPending} className={conv.isFavorite ? "text-amber-400 hover:text-amber-300" : "text-gray-400 hover:text-amber-300"} title={conv.isFavorite ? "Remove favorite" : "Favorite"}>
                      {conv.isFavorite ? <Check className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleShare(conv.id)} disabled={shareMutation.isPending} className="text-gray-400 hover:text-blue-300" title="Copy share link"><Link2 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => exportConversationAsPdf(conv)} className="text-gray-400 hover:text-white" title="Export as PDF"><Download className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteConversation(conv.id)} disabled={deleteHistoryMutation.isPending} className="text-red-400 hover:text-red-300 hover:bg-red-950" title="Delete conversation"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
