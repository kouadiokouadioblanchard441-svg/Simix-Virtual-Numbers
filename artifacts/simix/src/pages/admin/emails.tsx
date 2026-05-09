import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { adminApi } from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Send, Users, Globe, Loader2, BarChart3, CheckCircle2,
  XCircle, Eye, EyeOff, ChevronDown, ChevronRight, AlertCircle,
  Shield, Gift, Star, Megaphone, Info, Zap, Clock, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TEMPLATE_TYPES = [
  { value: "info", label: "Information", icon: Info, color: "text-violet-400", accent: "#7c3aed" },
  { value: "security", label: "Sécurité", icon: Shield, color: "text-red-400", accent: "#ef4444" },
  { value: "bonus", label: "Bonus", icon: Gift, color: "text-green-400", accent: "#22c55e" },
  { value: "promotion", label: "Promotion", icon: Star, color: "text-amber-400", accent: "#f59e0b" },
  { value: "system", label: "Système", icon: Zap, color: "text-blue-400", accent: "#3b82f6" },
  { value: "announcement", label: "Annonce", icon: Megaphone, color: "text-purple-400", accent: "#a855f7" },
];

const EMAIL_TEMPLATES = [
  {
    type: "announcement",
    subject: "🚀 Grande nouveauté sur Simix !",
    body: "Bonjour,\n\nNous sommes ravis de vous annoncer une nouvelle fonctionnalité exclusive sur Simix.\n\nDécouvrez dès maintenant toutes nos dernières mises à jour et profitez d'une expérience encore plus fluide et sécurisée.\n\nMerci de votre confiance.\n\nL'équipe Simix",
  },
  {
    type: "promotion",
    subject: "🎁 Offre exclusive — 48h seulement",
    body: "Bonjour,\n\nPendant les prochaines 48h, bénéficiez d'une offre exceptionnelle sur la plateforme Simix.\n\nConnectez-vous maintenant pour en profiter avant que l'offre expire !\n\nBonne journée,\nL'équipe Simix",
  },
  {
    type: "security",
    subject: "🔐 Alerte sécurité — Action requise",
    body: "Bonjour,\n\nNous avons détecté une activité inhabituelle sur votre compte Simix.\n\nPour votre sécurité, nous vous recommandons de :\n1. Changer votre mot de passe immédiatement\n2. Activer la double authentification\n3. Vérifier vos transactions récentes\n\nSi vous n'êtes pas à l'origine de cette activité, contactez-nous immédiatement.\n\nL'équipe Sécurité Simix",
  },
  {
    type: "bonus",
    subject: "💰 Bonus crédité sur votre compte !",
    body: "Bonjour,\n\nBonne nouvelle ! Un bonus vient d'être crédité sur votre compte Simix.\n\nConnectez-vous pour voir le montant et commencer à en profiter dès maintenant !\n\nMerci pour votre fidélité,\nL'équipe Simix",
  },
];

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "À l'instant";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return new Date(d).toLocaleDateString("fr-FR");
}

function statusBadge(status: string) {
  switch (status) {
    case "sent": return <span className="flex items-center gap-1 text-green-400 text-[10px] font-semibold"><CheckCircle2 className="w-3 h-3" />Envoyé</span>;
    case "sending": return <span className="flex items-center gap-1 text-amber-400 text-[10px] font-semibold"><Loader2 className="w-3 h-3 animate-spin" />En cours</span>;
    case "failed": return <span className="flex items-center gap-1 text-red-400 text-[10px] font-semibold"><XCircle className="w-3 h-3" />Échec</span>;
    default: return <span className="flex items-center gap-1 text-zinc-400 text-[10px] font-semibold"><Clock className="w-3 h-3" />En attente</span>;
  }
}

/* ── Stats ───────────────────────────────────────────────── */
function StatsSection() {
  const { data } = useQuery({
    queryKey: ["email-stats"],
    queryFn: () => adminApi.getEmailStats(),
    refetchInterval: 30000,
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: "Campagnes", value: data?.totalCampaigns ?? 0, icon: Mail, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
        { label: "Emails envoyés", value: data?.totalSent ?? 0, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
        { label: "Échecs", value: data?.totalFailed ?? 0, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
        { label: "Resend", value: data?.resendConfigured ? "✓ Actif" : "⚠ Absent", icon: Settings, color: data?.resendConfigured ? "text-green-400" : "text-amber-400", bg: data?.resendConfigured ? "bg-green-500/10 border-green-500/20" : "bg-amber-500/10 border-amber-500/20" },
      ].map(c => (
        <div key={c.label} className={cn("rounded-2xl border p-4 flex flex-col gap-1.5", c.bg)}>
          <c.icon className={cn("w-4 h-4", c.color)} />
          <div className={cn("text-xl font-bold", typeof c.value === "string" ? "text-sm" : "", c.color === "text-green-400" || c.color === "text-violet-400" ? "text-white" : c.color)}>
            {typeof c.value === "number" ? c.value.toLocaleString() : c.value}
          </div>
          <div className="text-xs text-zinc-400">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Compose ─────────────────────────────────────────────── */
function ComposeForm() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateType, setTemplateType] = useState("info");
  const [recipientsType, setRecipientsType] = useState<"all" | "specific">("all");
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const sendMutation = useMutation({
    mutationFn: () => adminApi.sendEmailCampaign({ subject, body, templateType, recipientsType }),
    onSuccess: (data) => {
      toast({
        title: "📧 Campagne lancée !",
        description: `Envoi en cours pour ${data.totalRecipients} destinataire(s)...`,
      });
      setSubject(""); setBody("");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const applyTemplate = (t: typeof EMAIL_TEMPLATES[0]) => {
    setTemplateType(t.type);
    setSubject(t.subject);
    setBody(t.body);
    setShowTemplates(false);
  };

  const accent = TEMPLATE_TYPES.find(t => t.value === templateType)?.accent ?? "#7c3aed";

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Send className="w-4 h-4 text-violet-400" />
          Nouvelle campagne email
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTemplates(v => !v)}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-lg transition-all"
          >
            Templates {showTemplates ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 border border-zinc-600/30 px-3 py-1.5 rounded-lg transition-all"
          >
            {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showPreview ? "Masquer aperçu" : "Aperçu HTML"}
          </button>
        </div>
      </div>

      {/* Templates */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-hidden"
          >
            {EMAIL_TEMPLATES.map((t, i) => {
              const ti = TEMPLATE_TYPES.find(x => x.value === t.type)!;
              return (
                <button key={i} onClick={() => applyTemplate(t)}
                  className="text-left p-3 rounded-xl bg-zinc-700/40 hover:bg-zinc-700/70 border border-zinc-600/30 hover:border-violet-500/30 transition-all"
                >
                  <div className={cn("text-xs font-semibold mb-0.5 flex items-center gap-1.5", ti.color)}>
                    <ti.icon className="w-3 h-3" /> {t.subject}
                  </div>
                  <div className="text-[11px] text-zinc-500 line-clamp-1">{t.body}</div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template type */}
      <div>
        <label className="text-xs text-zinc-400 mb-2 block font-medium">Type de campagne</label>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_TYPES.map(t => (
            <button key={t.value} onClick={() => setTemplateType(t.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                templateType === t.value
                  ? `bg-[${t.accent}]/20 ${t.color} border-current`
                  : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
              )}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block font-medium">Sujet *</label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Ex: 🎉 Nouvelle offre exclusive sur Simix !"
          className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-600/40 focus:border-violet-500/60"
        />
      </div>

      {/* Body */}
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block font-medium">Contenu du mail *</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={8}
          placeholder="Rédigez le contenu de votre email ici...\n\nConseils :\n- Soyez clair et concis\n- Personnalisez votre message\n- Ajoutez un call-to-action fort"
          className="w-full bg-zinc-700/60 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-zinc-600/40 focus:border-violet-500/60 resize-y font-mono"
        />
        <p className="text-[11px] text-zinc-500 mt-1">Le contenu sera automatiquement mis en page avec le template Simix professionnel</p>
      </div>

      {/* HTML Preview */}
      <AnimatePresence>
        {showPreview && subject && body && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden rounded-xl border border-zinc-600/40"
          >
            <div className="px-3 py-2 bg-zinc-700/40 border-b border-zinc-600/40 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs text-zinc-400 font-medium">Aperçu de l'email</span>
            </div>
            <div className="max-h-64 overflow-y-auto bg-[#0f0a1e] p-4">
              <div className="text-center mb-3">
                <div className="inline-flex items-center gap-2 text-white font-bold text-lg">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}>S</div>
                  Simix
                </div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: `${accent}11`, border: `1px solid ${accent}33` }}>
                <h2 className="text-white font-bold text-base mb-2">{subject}</h2>
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recipients */}
      <div>
        <label className="text-xs text-zinc-400 mb-2 block font-medium">Destinataires</label>
        <div className="flex gap-2">
          {[
            { value: "all", label: "Tous les utilisateurs actifs", icon: Globe },
            { value: "specific", label: "Sélection manuelle", icon: Users },
          ].map(r => (
            <button key={r.value} onClick={() => setRecipientsType(r.value as "all" | "specific")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all",
                recipientsType === r.value
                  ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/20"
                  : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300"
              )}
            >
              <r.icon className="w-3.5 h-3.5" /> {r.label}
            </button>
          ))}
        </div>
        {recipientsType === "all" && (
          <p className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            Enverra à tous les utilisateurs au statut "Actif" dans Supabase
          </p>
        )}
      </div>

      {/* Send button */}
      <button
        onClick={() => sendMutation.mutate()}
        disabled={sendMutation.isPending || !subject.trim() || !body.trim()}
        className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
      >
        {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {recipientsType === "all" ? "🚀 Envoyer à tous les utilisateurs" : "🎯 Envoyer à la sélection"}
      </button>
    </div>
  );
}

/* ── Campaigns list ──────────────────────────────────────── */
function CampaignsList() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["email-campaigns"],
    queryFn: () => adminApi.getEmailCampaigns(),
    refetchInterval: 15000,
  });

  const { data: logsData } = useQuery({
    queryKey: ["email-logs", expandedId],
    queryFn: () => adminApi.getEmailCampaignLogs(expandedId!),
    enabled: !!expandedId,
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>;

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-700/40 flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-violet-400" />
          Historique des campagnes
        </h3>
        <span className="text-xs text-zinc-500">{data?.total ?? 0} campagne(s)</span>
      </div>

      {!data?.campaigns?.length ? (
        <div className="text-center py-10">
          <Mail className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">Aucune campagne envoyée</p>
          <p className="text-zinc-600 text-xs mt-1">Composez votre premier email ci-dessus</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-700/30">
          {data.campaigns.map((c: {
            id: string;
            subject: string;
            templateType: string;
            status: string;
            sentCount: number;
            failedCount: number;
            totalRecipients: number;
            createdAt: string;
            sentAt?: string;
          }) => {
            const ti = TEMPLATE_TYPES.find(t => t.value === c.templateType) ?? TEMPLATE_TYPES[0];
            const isExpanded = expandedId === c.id;
            const successRate = c.totalRecipients > 0 ? Math.round((c.sentCount / c.totalRecipients) * 100) : 0;

            return (
              <div key={c.id}>
                <div
                  className="flex items-start gap-3 p-4 hover:bg-white/2 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5", ti.color === "text-violet-400" ? "bg-violet-500/15" : ti.color === "text-red-400" ? "bg-red-500/15" : ti.color === "text-green-400" ? "bg-green-500/15" : ti.color === "text-amber-400" ? "bg-amber-500/15" : "bg-blue-500/15")}>
                    <ti.icon className={cn("w-4 h-4", ti.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white text-sm font-semibold truncate">{c.subject}</p>
                      {statusBadge(c.status)}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.totalRecipients} destinataires</span>
                      <span className="flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3 h-3" />{c.sentCount} envoyés</span>
                      {c.failedCount > 0 && <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3 h-3" />{c.failedCount} échecs</span>}
                      <span>{timeAgo(c.createdAt)}</span>
                    </div>
                    {c.status === "sent" && c.totalRecipients > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${successRate}%` }} />
                        </div>
                        <span className="text-[10px] text-zinc-500">{successRate}%</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className={cn("w-4 h-4 text-zinc-600 flex-shrink-0 mt-1 transition-transform", isExpanded && "rotate-90")} />
                </div>

                {/* Expanded logs */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 bg-zinc-900/40">
                        <div className="rounded-xl border border-zinc-700/40 overflow-hidden">
                          <div className="px-3 py-2 bg-zinc-800/60 border-b border-zinc-700/30 text-xs text-zinc-400 font-medium">
                            Détail des envois
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {!logsData?.logs?.length ? (
                              <div className="py-4 text-center text-zinc-500 text-xs">Aucun log disponible</div>
                            ) : (
                              logsData.logs.map((log: { id: string; email: string; status: string; fullName?: string; error?: string; sentAt?: string }) => (
                                <div key={log.id} className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60 last:border-0">
                                  {log.status === "sent"
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                                    : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                                  <span className="text-xs text-white flex-1 truncate">{log.fullName ?? log.email}</span>
                                  <span className="text-[10px] text-zinc-500 truncate">{log.email}</span>
                                  {log.error && <span className="text-[10px] text-red-400 truncate max-w-[100px]">{log.error}</span>}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Resend config warning ───────────────────────────────── */
function ResendWarning() {
  const { data } = useQuery({ queryKey: ["email-stats"], queryFn: () => adminApi.getEmailStats() });
  if (data?.resendConfigured) return null;

  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
      <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-amber-300 text-sm font-semibold">Resend API non configuré</p>
        <p className="text-amber-400/70 text-xs mt-0.5 leading-relaxed">
          La clé API Resend n'est pas configurée. Les emails seront simulés (loggés mais non envoyés).
          Ajoutez la variable <code className="bg-amber-500/20 px-1 rounded text-amber-300">RESEND_API_KEY</code> dans les paramètres de l'environnement pour activer l'envoi réel.
        </p>
      </div>
    </div>
  );
}

export default function AdminEmails() {
  return (
    <AdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">Campagnes Email</h1>
              <p className="text-zinc-400 text-sm">Envoyez des emails professionnels à vos utilisateurs via Resend</p>
            </div>
          </div>

          <ResendWarning />
          <StatsSection />
          <ComposeForm />
          <CampaignsList />
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
