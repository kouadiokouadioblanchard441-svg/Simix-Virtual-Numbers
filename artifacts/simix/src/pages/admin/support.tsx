import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type SupportConversation, type SupportMessage, type KnowledgeEntry, type AiConfigEntry } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Bot, BookOpen, Settings2, BarChart3,
  Send, User, RefreshCw, Trash2, Edit3, Plus, Check, X,
  UserCheck, UserX, AlertCircle, Clock, Globe, Search,
  ChevronRight, Save, Eye, EyeOff, Loader2, Shield,
  PhoneCall, Mail, Activity, TrendingUp, Zap, Key, Cpu, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

/* ── Tab type ────────────────────────────────────────────── */
type Tab = "conversations" | "knowledge" | "config" | "stats";

/* ── Helpers ─────────────────────────────────────────────── */
function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "À l'instant";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}j`;
}

function statusColor(status: string) {
  switch (status) {
    case "active": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "takeover": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "resolved": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "closed": return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    default: return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "active": return "Actif (IA)";
    case "takeover": return "Prise en charge";
    case "resolved": return "Résolu";
    case "closed": return "Fermé";
    default: return status;
  }
}

function priorityColor(p: string) {
  switch (p) {
    case "urgent": return "text-red-400";
    case "high": return "text-orange-400";
    default: return "text-zinc-500";
  }
}

const KNOWLEDGE_CATEGORIES = [
  "general", "faq", "paiement", "recharge", "securite", "onboarding",
  "annonce", "promotion", "regles", "tutoriel", "entreprise", "contact"
];

const CATEGORY_LABELS: Record<string, string> = {
  general: "Général", faq: "FAQ", paiement: "Paiement", recharge: "Recharge",
  securite: "Sécurité", onboarding: "Tutoriel d'accueil", annonce: "Annonces",
  promotion: "Promotions", regles: "Règles", tutoriel: "Tutoriels", entreprise: "Entreprise", contact: "Contact",
};

/* ── STATS TAB ───────────────────────────────────────────── */
function StatsTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["support-stats"],
    queryFn: () => adminApi.getSupportStats(),
    refetchInterval: 30000,
  });

  const cards = stats ? [
    { label: "Conversations totales", value: stats.totalConversations, icon: MessageSquare, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
    { label: "Actives (IA)", value: stats.activeConversations, icon: Bot, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
    { label: "Prises en charge", value: stats.takeoverConversations, icon: UserCheck, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
    { label: "Résolues", value: stats.resolvedConversations, icon: Check, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { label: "Cette semaine", value: stats.weeklyConversations, icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
    { label: "Aujourd'hui", value: stats.dailyConversations, icon: Activity, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
    { label: "Messages totaux", value: stats.totalMessages, icon: MessageSquare, color: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/20" },
    { label: "Réponses admin", value: stats.adminMessages, icon: UserCheck, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    { label: "Entrées base de connaissance", value: stats.knowledgeEntries, icon: BookOpen, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
    { label: "Connaissances actives", value: stats.activeKnowledgeEntries, icon: Zap, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  ] : [];

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {cards.map(c => (
        <div key={c.label} className={cn("rounded-2xl border p-4 flex flex-col gap-2", c.bg)}>
          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", c.bg)}>
            <c.icon className={cn("w-4 h-4", c.color)} />
          </div>
          <div className="text-2xl font-bold text-white">{c.value.toLocaleString()}</div>
          <div className="text-xs text-zinc-400">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── CONVERSATION DETAIL ─────────────────────────────────── */
function ConversationDetail({ conv, onClose }: { conv: SupportConversation; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = useState("");
  const [agentNote, setAgentNote] = useState(conv.agentNote ?? "");
  const [isSendingNote, setIsSendingNote] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["support-messages", conv.id],
    queryFn: () => adminApi.getSupportMessages(conv.id),
    refetchInterval: 5000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  const sendMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => adminApi.sendSupportMessage(conv.id, content),
    onSuccess: () => {
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["support-messages", conv.id] });
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: (data: Parameters<typeof adminApi.updateConversationStatus>[1]) =>
      adminApi.updateConversationStatus(conv.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
      toast({ title: "Mis à jour" });
    },
  });

  const saveNote = async () => {
    setIsSendingNote(true);
    await statusMutation.mutateAsync({ agentNote });
    setIsSendingNote(false);
  };

  const messages = data?.messages ?? [];
  const displayName = conv.userFullName ?? conv.userName ?? "Utilisateur anonyme";

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="flex flex-col h-full bg-zinc-900/80 rounded-2xl border border-zinc-800/60 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/90 flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {displayName[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm truncate">{displayName}</div>
          <div className="text-xs text-zinc-500 flex items-center gap-1.5">
            <Globe className="w-3 h-3" />
            {conv.language?.toUpperCase()}
            {conv.userPhone && <span>• {conv.userPhone}</span>}
            {conv.userEmail && <span>• {conv.userEmail}</span>}
          </div>
        </div>
        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", statusColor(conv.status))}>
          {statusLabel(conv.status)}
        </span>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/40 bg-zinc-950/30 flex-shrink-0 flex-wrap">
        {conv.isHumanTakeover ? (
          <button
            onClick={() => statusMutation.mutate({ isHumanTakeover: false, status: "active" })}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
          >
            <Bot className="w-3.5 h-3.5" />
            Rendre à l'IA
          </button>
        ) : (
          <button
            onClick={() => statusMutation.mutate({ isHumanTakeover: true, status: "takeover" })}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Prendre en charge
          </button>
        )}
        {conv.status !== "resolved" && (
          <button
            onClick={() => statusMutation.mutate({ status: "resolved" })}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Résoudre
          </button>
        )}
        {["urgent", "high", "normal"].map(p => (
          <button
            key={p}
            onClick={() => statusMutation.mutate({ priority: p })}
            className={cn(
              "text-xs px-2.5 py-1 rounded-lg border transition-colors",
              conv.priority === p
                ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
            )}
          >
            {p === "urgent" ? "🔴 Urgent" : p === "high" ? "🟡 Élevé" : "⚪ Normal"}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {isLoading && <div className="flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>}
        {messages.map(msg => (
          <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row" : "flex-row-reverse")}>
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-1",
              msg.role === "user" ? "bg-zinc-700 text-zinc-300" : msg.sentByAdmin ? "bg-orange-600 text-white" : "bg-violet-600 text-white"
            )}>
              {msg.role === "user" ? "U" : msg.sentByAdmin ? "A" : "AI"}
            </div>
            <div className={cn("max-w-[80%] flex flex-col gap-0.5", msg.role === "user" ? "items-start" : "items-end")}>
              {msg.imageData && (
                <img src={msg.imageData} alt="img" className="max-h-32 rounded-xl border border-zinc-700/60 object-contain mb-1" />
              )}
              <div className={cn(
                "px-3 py-2 text-sm rounded-2xl whitespace-pre-wrap break-words leading-relaxed",
                msg.role === "user"
                  ? "bg-zinc-800/80 text-zinc-200 rounded-tl-sm"
                  : msg.sentByAdmin
                    ? "bg-orange-600/20 border border-orange-500/30 text-orange-100 rounded-tr-sm"
                    : "bg-violet-600/20 border border-violet-500/30 text-violet-100 rounded-tr-sm"
              )}>
                {msg.content}
              </div>
              <span className="text-[10px] text-zinc-600 px-1">
                {msg.sentByAdmin ? "Admin • " : ""}{new Date(msg.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Agent note */}
      <div className="px-4 py-2 border-t border-zinc-800/40 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={agentNote}
            onChange={e => setAgentNote(e.target.value)}
            placeholder="Note interne (non visible par l'utilisateur)"
            className="flex-1 bg-zinc-800/40 text-zinc-300 text-xs rounded-lg px-3 py-1.5 outline-none border border-zinc-700/40 focus:border-violet-500/50 placeholder-zinc-600"
          />
          <button onClick={saveNote} disabled={isSendingNote} className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
            {isSendingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Reply box */}
      <div className="px-4 py-3 border-t border-zinc-800/60 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (replyText.trim()) sendMutation.mutate({ content: replyText }); } }}
            placeholder="Répondre en tant qu'agent... (Entrée pour envoyer)"
            rows={2}
            className="flex-1 bg-zinc-800/60 text-white text-sm rounded-xl px-3 py-2 outline-none resize-none border border-zinc-700/40 focus:border-orange-500/50 placeholder-zinc-600"
            style={{ maxHeight: 80 }}
          />
          <button
            onClick={() => { if (replyText.trim()) sendMutation.mutate({ content: replyText }); }}
            disabled={sendMutation.isPending || !replyText.trim()}
            className="flex-shrink-0 p-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1.5 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Vos messages seront envoyés comme réponse humaine et l'IA sera mise en pause
        </p>
      </div>
    </motion.div>
  );
}

/* ── CONVERSATIONS TAB ───────────────────────────────────── */
function ConversationsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<SupportConversation | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["support-conversations", statusFilter],
    queryFn: () => adminApi.getSupportConversations({ limit: 100, status: statusFilter || undefined }),
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
      setSelected(null);
      toast({ title: "Conversation supprimée" });
    },
  });

  const conversations = (data?.conversations ?? []).filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.userName?.toLowerCase().includes(s) ||
      c.userFullName?.toLowerCase().includes(s) ||
      c.userEmail?.toLowerCase().includes(s) ||
      c.userPhone?.toLowerCase().includes(s) ||
      c.sessionId.toLowerCase().includes(s)
    );
  });

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[400px]">
      {/* List */}
      <div className={cn("flex flex-col", selected ? "w-96 flex-shrink-0" : "flex-1")}>
        {/* Filters */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-32">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full bg-zinc-800/60 text-white text-sm rounded-xl pl-8 pr-3 py-2 outline-none border border-zinc-700/40 focus:border-violet-500/50"
            />
          </div>
          {["", "active", "takeover", "resolved", "closed"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-xl border transition-colors",
                statusFilter === s
                  ? "bg-violet-600 border-violet-500 text-white"
                  : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              )}
            >
              {s === "" ? "Tous" : statusLabel(s)}
            </button>
          ))}
          <button onClick={() => refetch()} className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700/40 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>}
          {!isLoading && conversations.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Aucune conversation</p>
            </div>
          )}
          {conversations.map(conv => (
            <motion.div
              key={conv.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setSelected(conv)}
              className={cn(
                "p-3 rounded-xl border cursor-pointer transition-all group",
                selected?.id === conv.id
                  ? "bg-violet-600/10 border-violet-500/40"
                  : "bg-zinc-800/40 border-zinc-700/40 hover:border-zinc-600/60 hover:bg-zinc-800/60"
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {(conv.userFullName ?? conv.userName ?? "?")[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white text-sm font-medium truncate">
                      {conv.userFullName ?? conv.userName ?? "Anonyme"}
                    </span>
                    <span className="text-[10px] text-zinc-500 flex-shrink-0">{timeAgo(conv.updatedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", statusColor(conv.status))}>
                      {statusLabel(conv.status)}
                    </span>
                    {conv.isHumanTakeover && (
                      <span className="text-[10px] text-orange-400 flex items-center gap-0.5">
                        <UserCheck className="w-3 h-3" />Agent
                      </span>
                    )}
                    <span className={cn("text-[10px] capitalize ml-auto", priorityColor(conv.priority))}>
                      {conv.priority !== "normal" && `● ${conv.priority}`}
                    </span>
                  </div>
                  {conv.agentNote && (
                    <p className="text-[10px] text-zinc-500 mt-1 truncate italic">📝 {conv.agentNote}</p>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); if (confirm("Supprimer cette conversation ?")) deleteMutation.mutate(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Detail */}
      <AnimatePresence>
        {selected && (
          <div className="flex-1 min-w-0">
            <ConversationDetail conv={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── KNOWLEDGE TAB ───────────────────────────────────────── */
function KnowledgeTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [catFilter, setCatFilter] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "general", title: "", content: "", isActive: true, sortOrder: 0 });
  const [editForm, setEditForm] = useState<Partial<KnowledgeEntry>>({});

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["knowledge", catFilter],
    queryFn: () => adminApi.getKnowledge(catFilter || undefined),
  });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createKnowledge(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      setShowForm(false);
      setForm({ category: "general", title: "", content: "", isActive: true, sortOrder: 0 });
      toast({ title: "Entrée créée ✓" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<KnowledgeEntry> }) => adminApi.updateKnowledge(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      setEditingId(null);
      toast({ title: "Mis à jour ✓" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteKnowledge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      toast({ title: "Supprimé" });
    },
  });

  const toggleActive = (entry: KnowledgeEntry) =>
    updateMutation.mutate({ id: entry.id, data: { isActive: !entry.isActive } });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setCatFilter("")}
            className={cn("text-xs px-3 py-1.5 rounded-xl border transition-colors", !catFilter ? "bg-violet-600 border-violet-500 text-white" : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800")}
          >
            Toutes
          </button>
          {KNOWLEDGE_CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={cn("text-xs px-3 py-1.5 rounded-xl border transition-colors", catFilter === c ? "bg-violet-600 border-violet-500 text-white" : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800")}
            >
              {CATEGORY_LABELS[c] ?? c}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle entrée
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-zinc-800/60 border border-violet-500/30 rounded-2xl p-5 space-y-3 overflow-hidden"
          >
            <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-violet-400" />Nouvelle entrée de connaissance</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Catégorie</label>
                <select
                  value={form.category}
                  onChange={e => setForm(v => ({ ...v, category: e.target.value }))}
                  className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600/40 focus:border-violet-500/60"
                >
                  {KNOWLEDGE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Titre</label>
                <input
                  value={form.title}
                  onChange={e => setForm(v => ({ ...v, title: e.target.value }))}
                  placeholder="Titre de l'entrée"
                  className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600/40 focus:border-violet-500/60"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Contenu (informations complètes)</label>
              <textarea
                value={form.content}
                onChange={e => setForm(v => ({ ...v, content: e.target.value }))}
                placeholder="Rédigez ici les informations que l'IA utilisera pour répondre aux utilisateurs..."
                rows={5}
                className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600/40 focus:border-violet-500/60 resize-y"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(v => ({ ...v, isActive: e.target.checked }))} className="rounded" />
                Actif immédiatement
              </label>
              <div className="flex-1" />
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Annuler</button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.title.trim() || !form.content.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Créer
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entries list */}
      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>}
      <div className="space-y-2">
        {entries.map(entry => (
          <motion.div key={entry.id} layout className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl overflow-hidden">
            {editingId === entry.id ? (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Catégorie</label>
                    <select
                      value={editForm.category ?? entry.category}
                      onChange={e => setEditForm(v => ({ ...v, category: e.target.value }))}
                      className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600/40"
                    >
                      {KNOWLEDGE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Titre</label>
                    <input
                      value={editForm.title ?? entry.title}
                      onChange={e => setEditForm(v => ({ ...v, title: e.target.value }))}
                      className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Contenu</label>
                  <textarea
                    value={editForm.content ?? entry.content}
                    onChange={e => setEditForm(v => ({ ...v, content: e.target.value }))}
                    rows={5}
                    className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600/40 resize-y"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => { setEditingId(null); setEditForm({}); }} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors">Annuler</button>
                  <button
                    onClick={() => updateMutation.mutate({ id: entry.id, data: editForm })}
                    disabled={updateMutation.isPending}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
                  >
                    {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-medium">
                      {CATEGORY_LABELS[entry.category] ?? entry.category}
                    </span>
                    {!entry.isActive && <span className="text-[10px] text-zinc-500">• Inactif</span>}
                  </div>
                  <h4 className="text-white font-medium text-sm">{entry.title}</h4>
                  <p className="text-zinc-400 text-xs mt-1 line-clamp-2">{entry.content}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleActive(entry)}
                    className={cn("p-1.5 rounded-lg transition-colors", entry.isActive ? "text-green-400 hover:bg-green-500/10" : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-700")}
                    title={entry.isActive ? "Désactiver" : "Activer"}
                  >
                    {entry.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => { setEditingId(entry.id); setEditForm({}); }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm("Supprimer cette entrée ?")) deleteMutation.mutate(entry.id); }}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ))}
        {!isLoading && entries.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucune entrée dans cette catégorie</p>
            <p className="text-xs mt-1">Cliquez sur "Nouvelle entrée" pour ajouter des informations que l'IA utilisera</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── AI CONFIG TAB ───────────────────────────────────────── */
function ConfigTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [localConfig, setLocalConfig] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  const { data: configEntries = [], isLoading } = useQuery({
    queryKey: ["ai-config"],
    queryFn: () => adminApi.getAiConfig(),
  });

  useEffect(() => {
    if (configEntries.length > 0) {
      const m: Record<string, string> = {};
      for (const e of configEntries) m[e.key] = e.value;
      setLocalConfig(m);
      setIsDirty(false);
    }
  }, [configEntries]);

  const saveMutation = useMutation({
    mutationFn: () => adminApi.updateAiConfig(localConfig),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-config"] });
      setIsDirty(false);
      toast({ title: "Configuration sauvegardée ✓", description: "L'IA utilisera ces paramètres immédiatement" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateLocal = (key: string, value: string) => {
    setLocalConfig(v => ({ ...v, [key]: value }));
    setIsDirty(true);
  };

  const [showApiKey, setShowApiKey] = useState(false);

  const groups = configEntries.reduce<Record<string, AiConfigEntry[]>>((acc, e) => {
    (acc[e.group] = acc[e.group] ?? []).push(e);
    return acc;
  }, {});

  const GROUP_LABELS: Record<string, string> = {
    api: "🔑 Fournisseur IA & API", identite: "🤖 Identité de l'IA", comportement: "🎭 Comportement", messages: "💬 Messages configurables",
    horaires: "🕐 Horaires", entreprise: "🏢 Informations entreprise", technique: "⚙️ Technique",
  };

  const currentProvider = localConfig["ai_provider"] ?? "gemini";
  const geminiApiKey = localConfig["gemini_api_key"] ?? "";
  const geminiModel = localConfig["gemini_model"] ?? "gemini-2.0-flash";
  const groqApiKey = localConfig["groq_api_key"] ?? "";
  const groqModel = localConfig["groq_model"] ?? "llama-3.3-70b-versatile";
  const openrouterApiKey = localConfig["openrouter_api_key"] ?? "";
  const openrouterModel = localConfig["openrouter_model"] ?? "meta-llama/llama-3.1-8b-instruct:free";

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>;

  /* groups minus "api" — we render api group manually */
  const otherGroups = Object.entries(groups).filter(([g]) => g !== "api");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Configuration de l'IA</h3>
          <p className="text-zinc-400 text-sm">Ces paramètres sont chargés en temps réel — aucun redéploiement nécessaire</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !isDirty}
          className={cn(
            "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all",
            isDirty
              ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25"
              : "bg-zinc-800 text-zinc-500 cursor-default"
          )}
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isDirty ? "Enregistrer les changements" : "Sauvegardé"}
        </button>
      </div>

      {/* ── Gemini / API Provider Section ── */}
      <div className="bg-gradient-to-br from-blue-950/60 to-indigo-950/40 border border-blue-500/20 rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm">Fournisseur IA & Clé API</h4>
            <p className="text-xs text-zinc-400">Choisissez le moteur IA utilisé par le service client</p>
          </div>
        </div>

        {/* Provider selector */}
        <div>
          <label className="text-xs text-zinc-400 mb-2 block font-medium">Fournisseur IA actif</label>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { value: "gemini", label: "Google Gemini", badge: "Gratuit", icon: "🌟", activeClass: "bg-blue-600/20 border-blue-500/50 text-blue-300 shadow-blue-500/10" },
              { value: "groq", label: "Groq", badge: "Gratuit + Rapide", icon: "⚡", activeClass: "bg-orange-600/20 border-orange-500/50 text-orange-300 shadow-orange-500/10" },
              { value: "openrouter", label: "OpenRouter", badge: "Gratuit", icon: "🔀", activeClass: "bg-emerald-600/20 border-emerald-500/50 text-emerald-300 shadow-emerald-500/10" },
              { value: "openai", label: "OpenAI GPT", badge: "Payant", icon: "🤖", activeClass: "bg-violet-600/20 border-violet-500/50 text-violet-300 shadow-violet-500/10" },
            ].map(p => (
              <button
                key={p.value}
                onClick={() => updateLocal("ai_provider", p.value)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all",
                  currentProvider === p.value
                    ? `${p.activeClass} shadow-lg`
                    : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                )}
              >
                <span className="text-base flex-shrink-0">{p.icon}</span>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-xs font-semibold truncate">{p.label}</span>
                  <span className="text-[10px] opacity-60 truncate">{p.badge}</span>
                </div>
                {currentProvider === p.value && <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* ── Gemini config ── */}
        <AnimatePresence>
          {currentProvider === "gemini" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 flex items-center gap-1.5 font-medium">
                  <Key className="w-3 h-3" />
                  Clé API Google Gemini
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={geminiApiKey}
                    onChange={e => updateLocal("gemini_api_key", e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-zinc-900/60 text-white text-sm rounded-xl px-3 py-2.5 pr-10 outline-none border border-blue-500/30 focus:border-blue-500/60 font-mono"
                  />
                  <button type="button" onClick={() => setShowApiKey(v => !v)} className="absolute right-3 text-zinc-500 hover:text-zinc-300 transition-colors">
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="mt-1.5">
                  {geminiApiKey.startsWith("AIzaSy") ? (
                    <span className="flex items-center gap-1 text-[11px] text-green-400"><Check className="w-3 h-3" /> Clé configurée</span>
                  ) : geminiApiKey.length > 0 ? (
                    <span className="flex items-center gap-1 text-[11px] text-orange-400"><AlertCircle className="w-3 h-3" /> Format inhabituel</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-red-400"><AlertCircle className="w-3 h-3" /> Clé requise — <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline">Obtenir gratuitement</a></span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block font-medium">Modèle Gemini</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", desc: "Rapide & économique" },
                    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", desc: "Plus puissant" },
                    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash", desc: "Équilibré" },
                  ].map(m => (
                    <button key={m.value} onClick={() => updateLocal("gemini_model", m.value)}
                      className={cn("flex flex-col items-start px-4 py-2.5 rounded-xl border text-left transition-all",
                        geminiModel === m.value ? "bg-blue-600/20 border-blue-500/50 text-blue-300" : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                      )}>
                      <span className="text-xs font-medium">{m.label}</span>
                      <span className="text-[10px] opacity-70">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/15 rounded-xl p-3">
                <Shield className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  La clé API est stockée de façon sécurisée en base de données et n'est jamais exposée côté client.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Groq config ── */}
        <AnimatePresence>
          {currentProvider === "groq" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="flex items-start gap-2.5 bg-orange-500/8 border border-orange-500/20 rounded-xl p-3">
                <Zap className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-orange-300 font-medium mb-0.5">Groq — Ultra-rapide & Gratuit</p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Groq offre une inférence très rapide avec un accès gratuit. Créez votre clé sur <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 underline">console.groq.com</a>
                  </p>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 flex items-center gap-1.5 font-medium">
                  <Key className="w-3 h-3" />
                  Clé API Groq
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={groqApiKey}
                    onChange={e => updateLocal("groq_api_key", e.target.value)}
                    placeholder="gsk_..."
                    className="w-full bg-zinc-900/60 text-white text-sm rounded-xl px-3 py-2.5 pr-10 outline-none border border-orange-500/30 focus:border-orange-500/60 font-mono"
                  />
                  <button type="button" onClick={() => setShowApiKey(v => !v)} className="absolute right-3 text-zinc-500 hover:text-zinc-300 transition-colors">
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="mt-1.5">
                  {groqApiKey.startsWith("gsk_") ? (
                    <span className="flex items-center gap-1 text-[11px] text-green-400"><Check className="w-3 h-3" /> Clé Groq configurée</span>
                  ) : groqApiKey.length > 0 ? (
                    <span className="flex items-center gap-1 text-[11px] text-orange-400"><AlertCircle className="w-3 h-3" /> Format inhabituel (doit commencer par gsk_)</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-zinc-500"><AlertCircle className="w-3 h-3" /> Clé requise</span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block font-medium">Modèle Groq</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", desc: "Puissant & polyvalent" },
                    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B", desc: "Très rapide" },
                    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B", desc: "Contexte étendu" },
                  ].map(m => (
                    <button key={m.value} onClick={() => updateLocal("groq_model", m.value)}
                      className={cn("flex flex-col items-start px-4 py-2.5 rounded-xl border text-left transition-all",
                        groqModel === m.value ? "bg-orange-600/20 border-orange-500/50 text-orange-300" : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                      )}>
                      <span className="text-xs font-medium">{m.label}</span>
                      <span className="text-[10px] opacity-70">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── OpenRouter config ── */}
        <AnimatePresence>
          {currentProvider === "openrouter" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="flex items-start gap-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3">
                <Activity className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-emerald-300 font-medium mb-0.5">OpenRouter — Accès à des centaines de modèles</p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Modèles gratuits disponibles. Créez votre clé sur <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">openrouter.ai</a>
                  </p>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 flex items-center gap-1.5 font-medium">
                  <Key className="w-3 h-3" />
                  Clé API OpenRouter
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={openrouterApiKey}
                    onChange={e => updateLocal("openrouter_api_key", e.target.value)}
                    placeholder="sk-or-..."
                    className="w-full bg-zinc-900/60 text-white text-sm rounded-xl px-3 py-2.5 pr-10 outline-none border border-emerald-500/30 focus:border-emerald-500/60 font-mono"
                  />
                  <button type="button" onClick={() => setShowApiKey(v => !v)} className="absolute right-3 text-zinc-500 hover:text-zinc-300 transition-colors">
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="mt-1.5">
                  {openrouterApiKey.startsWith("sk-or-") ? (
                    <span className="flex items-center gap-1 text-[11px] text-green-400"><Check className="w-3 h-3" /> Clé OpenRouter configurée</span>
                  ) : openrouterApiKey.length > 0 ? (
                    <span className="flex items-center gap-1 text-[11px] text-orange-400"><AlertCircle className="w-3 h-3" /> Format inhabituel (doit commencer par sk-or-)</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-zinc-500"><AlertCircle className="w-3 h-3" /> Clé requise</span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block font-medium">Modèle OpenRouter (modèles gratuits avec :free)</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B", desc: "Gratuit · Meta" },
                    { value: "google/gemma-3-12b-it:free", label: "Gemma 3 12B", desc: "Gratuit · Google" },
                    { value: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B", desc: "Gratuit · Mistral" },
                    { value: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", desc: "Gratuit · Puissant" },
                  ].map(m => (
                    <button key={m.value} onClick={() => updateLocal("openrouter_model", m.value)}
                      className={cn("flex flex-col items-start px-4 py-2.5 rounded-xl border text-left transition-all",
                        openrouterModel === m.value ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300" : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                      )}>
                      <span className="text-xs font-medium">{m.label}</span>
                      <span className="text-[10px] opacity-70">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Other config groups */}
      {otherGroups.map(([group, entries]) => (
        <div key={group} className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-5 space-y-4">
          <h4 className="text-white font-semibold text-sm">{GROUP_LABELS[group] ?? group}</h4>
          {entries.map(entry => (
            <div key={entry.key}>
              <label className="text-xs text-zinc-400 mb-1.5 block font-medium">{entry.label}</label>
              {entry.value?.length > 100 || entry.key.includes("greeting") || entry.key.includes("message") || entry.key.includes("replies") ? (
                <textarea
                  value={localConfig[entry.key] ?? entry.value}
                  onChange={e => updateLocal(entry.key, e.target.value)}
                  rows={3}
                  className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-600/40 focus:border-violet-500/60 resize-y"
                />
              ) : entry.key === "ai_enabled" || entry.key === "ai_image_analysis" ? (
                <div className="flex items-center gap-3">
                  {["true", "false"].map(val => (
                    <button
                      key={val}
                      onClick={() => updateLocal(entry.key, val)}
                      className={cn(
                        "px-4 py-1.5 rounded-xl text-sm border transition-colors",
                        (localConfig[entry.key] ?? entry.value) === val
                          ? val === "true" ? "bg-green-600 border-green-500 text-white" : "bg-red-600/80 border-red-500 text-white"
                          : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {val === "true" ? "✓ Activé" : "✗ Désactivé"}
                    </button>
                  ))}
                </div>
              ) : entry.key === "ai_tone" ? (
                <div className="flex gap-2 flex-wrap">
                  {["professional_friendly", "formal", "casual"].map(val => (
                    <button
                      key={val}
                      onClick={() => updateLocal(entry.key, val)}
                      className={cn(
                        "px-4 py-1.5 rounded-xl text-sm border transition-colors",
                        (localConfig[entry.key] ?? entry.value) === val
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {val === "professional_friendly" ? "Professionnel & Chaleureux" : val === "formal" ? "Formel" : "Décontracté"}
                    </button>
                  ))}
                </div>
              ) : entry.key === "ai_response_style" ? (
                <div className="flex gap-2">
                  {["concise", "detailed"].map(val => (
                    <button
                      key={val}
                      onClick={() => updateLocal(entry.key, val)}
                      className={cn(
                        "px-4 py-1.5 rounded-xl text-sm border transition-colors",
                        (localConfig[entry.key] ?? entry.value) === val
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {val === "concise" ? "Concis" : "Détaillé"}
                    </button>
                  ))}
                </div>
              ) : entry.key === "ai_avatar_url" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-violet-500/40 flex-shrink-0 bg-zinc-700">
                      {(localConfig[entry.key] ?? entry.value) ? (
                        <img
                          src={localConfig[entry.key] ?? entry.value}
                          alt="Avatar aperçu"
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">?</div>
                      )}
                    </div>
                    <input
                      value={localConfig[entry.key] ?? entry.value}
                      onChange={e => updateLocal(entry.key, e.target.value)}
                      placeholder="/support-avatar.png ou https://..."
                      className="flex-1 bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600/40 focus:border-violet-500/60"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500">Entrez l'URL de l'image ou le chemin relatif (ex: /support-avatar.png). L'image par défaut générée est déjà configurée.</p>
                </div>
              ) : (
                <input
                  value={localConfig[entry.key] ?? entry.value}
                  onChange={e => updateLocal(entry.key, e.target.value)}
                  className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2 outline-none border border-zinc-600/40 focus:border-violet-500/60"
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── MAIN PAGE ───────────────────────────────────────────── */
const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "stats", label: "Statistiques", icon: BarChart3 },
  { id: "conversations", label: "Conversations", icon: MessageSquare },
  { id: "knowledge", label: "Base de connaissance", icon: BookOpen },
  { id: "config", label: "Configuration IA", icon: Settings2 },
];

export default function AdminSupport() {
  const [activeTab, setActiveTab] = useState<Tab>("conversations");

  const { data: stats } = useQuery({
    queryKey: ["support-stats"],
    queryFn: () => adminApi.getSupportStats(),
    refetchInterval: 30000,
  });

  return (
    <AdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-white text-xl font-bold">Support IA — Simia</h1>
                  <p className="text-zinc-400 text-sm">Gérez votre assistante IA, la base de connaissance et les conversations</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {stats && (
                <>
                  <div className="text-right hidden sm:block">
                    <div className="text-white font-bold text-lg">{stats.activeConversations}</div>
                    <div className="text-zinc-500 text-xs">Actives</div>
                  </div>
                  {stats.takeoverConversations > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
                      <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                      <span className="text-orange-400 text-sm font-medium">{stats.takeoverConversations} en attente</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-violet-600 text-white shadow-md shadow-violet-500/25"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === "stats" && <StatsTab />}
              {activeTab === "conversations" && <ConversationsTab />}
              {activeTab === "knowledge" && <KnowledgeTab />}
              {activeTab === "config" && <ConfigTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
