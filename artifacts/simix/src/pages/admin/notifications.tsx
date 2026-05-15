import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { adminApi } from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Send, Trash2, Users, Globe, Shield, Gift, Star,
  Megaphone, Zap, Info, Loader2, CheckCheck, BarChart3,
  Target, Plus, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NOTIF_TYPES = [
  { value: "info", label: "Information", icon: Info, color: "text-violet-400", bg: "bg-violet-500/10" },
  { value: "security", label: "Sécurité", icon: Shield, color: "text-red-400", bg: "bg-red-500/10" },
  { value: "bonus", label: "Bonus", icon: Gift, color: "text-green-400", bg: "bg-green-500/10" },
  { value: "promotion", label: "Promotion", icon: Star, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { value: "system", label: "Système", icon: Zap, color: "text-blue-400", bg: "bg-blue-500/10" },
  { value: "announcement", label: "Annonce", icon: Megaphone, color: "text-purple-400", bg: "bg-purple-500/10" },
];

function typeInfo(type: string) {
  return NOTIF_TYPES.find(t => t.value === type) ?? NOTIF_TYPES[0];
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "À l'instant";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}j`;
}

/* ── Quick templates ─────────────────────────────────────── */
const QUICK_TEMPLATES = [
  { type: "announcement", title: "🎉 Mise à jour disponible", body: "Une nouvelle mise à jour de Simix est disponible. Profitez des nouvelles fonctionnalités dès maintenant !" },
  { type: "promotion", title: "🎁 Offre spéciale — Réduction exclusive", body: "Profitez de notre offre limitée : bénéficiez d'une réduction exclusive sur vos prochains achats de numéros virtuels. Offre valable 48h !" },
  { type: "security", title: "🔐 Alerte sécurité", body: "Pour votre sécurité, nous vous recommandons de mettre à jour votre mot de passe et d'activer l'authentification à deux facteurs." },
  { type: "bonus", title: "💰 Bonus crédité sur votre compte", body: "Un bonus a été crédité sur votre compte. Connectez-vous pour voir les détails et profiter de vos avantages." },
  { type: "system", title: "⚙️ Maintenance prévue", body: "Une maintenance est prévue ce soir. La plateforme sera indisponible de 02h à 04h (UTC). Merci de votre compréhension." },
];

/* ── Stats card ─────────────────────────────────────────── */
function StatsSection() {
  const { data } = useQuery({
    queryKey: ["admin-notif-stats"],
    queryFn: () => adminApi.getNotificationStats(),
    refetchInterval: 30000,
  });

  const cards = [
    { label: "Total envoyées", value: data?.total ?? 0, icon: Bell, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
    { label: "Globales", value: data?.global ?? 0, icon: Globe, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { label: "Ciblées", value: data?.targeted ?? 0, icon: Target, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map(c => (
        <div key={c.label} className={cn("rounded-2xl border p-4 flex flex-col gap-1.5", c.bg)}>
          <c.icon className={cn("w-4 h-4", c.color)} />
          <div className="text-2xl font-bold text-white">{c.value.toLocaleString()}</div>
          <div className="text-xs text-zinc-400">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Compose form ────────────────────────────────────────── */
function ComposeForm() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("info");
  const [link, setLink] = useState("");
  const [recipientsType, setRecipientsType] = useState<"all" | "specific">("all");
  const [showTemplates, setShowTemplates] = useState(false);

  const sendMutation = useMutation({
    mutationFn: () => adminApi.sendNotification({ title, body, type, link: link || undefined, recipientsType }),
    onSuccess: (data) => {
      toast({ title: `✅ ${data.created} notification(s) envoyée(s)`, description: "Les utilisateurs ont été notifiés en temps réel" });
      setTitle(""); setBody(""); setLink("");
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["admin-notif-stats"] });
    },
    onError: (e: Error) => toast({ title: "Notification non envoyée", description: e.message, variant: "destructive" }),
  });

  const applyTemplate = (t: typeof QUICK_TEMPLATES[0]) => {
    setType(t.type);
    setTitle(t.title);
    setBody(t.body);
    setShowTemplates(false);
  };

  const selectedType = typeInfo(type);

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Send className="w-4 h-4 text-violet-400" />
          Créer une notification
        </h3>
        <button
          onClick={() => setShowTemplates(v => !v)}
          className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 px-3 py-1.5 rounded-lg transition-all"
        >
          Templates rapides {showTemplates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Quick templates */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-hidden"
          >
            {QUICK_TEMPLATES.map((t, i) => {
              const ti = typeInfo(t.type);
              return (
                <button key={i} onClick={() => applyTemplate(t)}
                  className="text-left p-3 rounded-xl bg-zinc-700/40 hover:bg-zinc-700/70 border border-zinc-600/30 hover:border-violet-500/30 transition-all group"
                >
                  <div className={cn("text-xs font-semibold mb-0.5", ti.color)}>{t.title}</div>
                  <div className="text-[11px] text-zinc-500 line-clamp-1">{t.body}</div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Type selector */}
      <div>
        <label className="text-xs text-zinc-400 mb-2 block font-medium">Type de notification</label>
        <div className="flex flex-wrap gap-2">
          {NOTIF_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                type === t.value
                  ? `${t.bg} ${t.color} border-current`
                  : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block font-medium">Titre *</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ex: 🎉 Nouvelle offre disponible !"
          className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-600/40 focus:border-violet-500/60"
        />
      </div>

      {/* Body */}
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block font-medium">Contenu *</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          placeholder="Rédigez le message de la notification..."
          className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-600/40 focus:border-violet-500/60 resize-y"
        />
      </div>

      {/* Link */}
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block font-medium">Lien (optionnel)</label>
        <input
          value={link}
          onChange={e => setLink(e.target.value)}
          placeholder="/dashboard, /wallet, https://..."
          className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-600/40 focus:border-violet-500/60"
        />
      </div>

      {/* Recipients */}
      <div>
        <label className="text-xs text-zinc-400 mb-2 block font-medium">Destinataires</label>
        <div className="flex gap-2">
          {[
            { value: "all", label: "Tous les utilisateurs", icon: Globe },
            { value: "specific", label: "Utilisateurs spécifiques", icon: Users },
          ].map(r => (
            <button
              key={r.value}
              onClick={() => setRecipientsType(r.value as "all" | "specific")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all",
                recipientsType === r.value
                  ? "bg-violet-600 border-violet-500 text-white"
                  : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
              )}
            >
              <r.icon className="w-3.5 h-3.5" />
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      {(title || body) && (
        <div className={cn("rounded-xl border p-3", typeInfo(type).bg, "border-current/20")}>
          <p className="text-[10px] text-zinc-500 mb-1.5 font-medium uppercase tracking-wide">Aperçu</p>
          <div className="flex gap-2.5">
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0", typeInfo(type).bg)}>
              {(() => { const T = typeInfo(type); return <T.icon className={cn("w-4 h-4", T.color)} />; })()}
            </div>
            <div>
              <p className={cn("text-xs font-semibold", typeInfo(type).color)}>{title || "Titre de la notification"}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{body || "Contenu..."}</p>
            </div>
          </div>
        </div>
      )}

      {/* Send */}
      <button
        onClick={() => sendMutation.mutate()}
        disabled={sendMutation.isPending || !title.trim() || !body.trim()}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
      >
        {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {recipientsType === "all" ? "Envoyer à tous les utilisateurs" : "Envoyer aux utilisateurs sélectionnés"}
      </button>
    </div>
  );
}

/* ── Notifications list ──────────────────────────────────── */
function NotificationsList() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => adminApi.getAdminNotifications(),
    refetchInterval: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteNotification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["admin-notif-stats"] });
      toast({ title: "Notification supprimée" });
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>;

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-700/40 flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-violet-400" />
          Historique des notifications
        </h3>
        <span className="text-xs text-zinc-500">{data?.total ?? 0} au total</span>
      </div>

      {!data?.notifications?.length ? (
        <div className="text-center py-10">
          <Bell className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">Aucune notification envoyée</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-700/30">
          {data.notifications.map((n: { id: string; type: string; title: string; body: string; isGlobal: boolean; createdAt: string }) => {
            const ti = typeInfo(n.type);
            return (
              <div key={n.id} className="flex items-start gap-3 p-4 hover:bg-white/2 transition-colors group">
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5", ti.bg)}>
                  <ti.icon className={cn("w-4 h-4", ti.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-white text-sm font-semibold truncate">{n.title}</p>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0", ti.bg, ti.color)}>
                      {ti.label}
                    </span>
                    {n.isGlobal ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 font-medium flex-shrink-0">Global</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-500/10 text-zinc-400 font-medium flex-shrink-0">Ciblé</span>
                    )}
                  </div>
                  <p className="text-zinc-400 text-xs line-clamp-1">{n.body}</p>
                  <p className="text-zinc-600 text-[10px] mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
                <button
                  onClick={() => { if (confirm("Supprimer ?")) deleteMutation.mutate(n.id); }}
                  className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminNotifications() {
  return (
    <AdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">Notifications</h1>
              <p className="text-zinc-400 text-sm">Envoyez des notifications temps réel à vos utilisateurs</p>
            </div>
          </div>

          <StatsSection />
          <ComposeForm />
          <NotificationsList />
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
