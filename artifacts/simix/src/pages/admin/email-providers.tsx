import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { adminToken } from "@/lib/admin-token";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Zap, CheckCircle2, XCircle, AlertTriangle, Clock,
  RefreshCw, Send, BarChart3, List, ChevronUp, ChevronDown,
  Eye, EyeOff, Shield, Activity, Loader2, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...adminToken.getHeader(), "content-type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    adminToken.clear();
    window.location.href = `${BASE}/admin/secure-login`;
    throw new Error("Session administrateur expirée");
  }
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error((e as { error: string }).error); }
  return res.json() as Promise<T>;
}

/* ── Types ─────────────────────────────────────────────────── */
interface Provider {
  id: string; name: string; slug: string; priority: number; active: boolean;
  apiKeyMasked: string | null; hasApiSecret: boolean; domain: string | null;
  region: string | null; config: Record<string,string> | null;
  apiKeySource?: "database" | "environment" | "none"; senderEmail: string | null;
  senderName: string | null; role: "primary" | "fallback" | null;
  healthStatus: string; lastHealthCheck: string | null;
  consecutiveErrors: number; totalSent: number; totalFailed: number;
  successRate: number; lastError: string | null; lastErrorAt: string | null;
  createdAt: string; updatedAt: string;
}
interface SupportedProvider { slug: string; name: string; requiresSecret: boolean; requiresDomain: boolean }
interface Stats { queue: { sent: number; pending: number; failed: number }; totalAttempts: number; providers: Provider[] }
interface QueueItem { id: string; toEmail: string; subject: string; status: string; attempts: number; maxAttempts: number; nextRetryAt: string | null; sentAt: string | null; error: string | null; createdAt: string }
interface LogItem { id: string; queueId: string | null; providerName: string | null; providerSlug: string | null; attemptedAt: string; status: string; latencyMs: number | null; responseId: string | null; error: string | null; toEmail: string | null; subject: string | null }

/* ── Health badge ──────────────────────────────────────────── */
function HealthBadge({ status }: { status: string }) {
  const s = {
    healthy:  { icon: CheckCircle2, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", label: "Opérationnel" },
    degraded: { icon: AlertTriangle, color: "text-amber-400 bg-amber-400/10 border-amber-400/30", label: "Dégradé" },
    down:     { icon: XCircle, color: "text-red-400 bg-red-400/10 border-red-400/30", label: "Hors service" },
    unknown:  { icon: Clock, color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20", label: "Inconnu" },
  }[status] ?? { icon: Clock, color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20", label: status };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.color}`}>
      <Icon className="w-3 h-3" />{s.label}
    </span>
  );
}

const EMPTY_FORM = { name: "", slug: "", priority: 10, active: false, apiKey: "", apiSecret: "", domain: "", region: "", config: "" };

/* ════════════════════════════════════════════════════════════ */
export default function AdminEmailProviders() {
  const [providers, setProviders]     = useState<Provider[]>([]);
  const [supported, setSupported]     = useState<SupportedProvider[]>([]);
  const [stats, setStats]             = useState<Stats | null>(null);
  const [queue, setQueue]             = useState<QueueItem[]>([]);
  const [logs, setLogs]               = useState<LogItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<"providers"|"stats"|"queue"|"logs">("providers");
  const [showModal, setShowModal]     = useState(false);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [showKey, setShowKey]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [testEmail, setTestEmail]     = useState("");
  const [testingId, setTestingId]     = useState<string | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        api<{ providers: Provider[]; supported: SupportedProvider[] }>("GET", "/admin/email-providers"),
        api<Stats>("GET", "/admin/email-providers/stats"),
      ]);
      setProviders(r1.providers); setSupported(r1.supported); setStats(r2);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadQueue = useCallback(async () => {
    const r = await api<{ queue: QueueItem[] }>("GET", "/admin/email-providers/queue");
    setQueue(r.queue);
  }, []);

  const loadLogs = useCallback(async () => {
    const r = await api<{ logs: LogItem[] }>("GET", "/admin/email-providers/logs");
    setLogs(r.logs);
  }, []);

  useEffect(() => {
    if (tab === "queue") void loadQueue();
    if (tab === "logs")  void loadLogs();
  }, [tab, loadQueue, loadLogs]);

  const openCreate = () => {
    setEditProvider(null);
    setForm(EMPTY_FORM);
    setShowKey(false);
    setShowModal(true);
  };

  const openEdit = (p: Provider) => {
    setEditProvider(p);
    setForm({ name: p.name, slug: p.slug, priority: p.priority, active: p.active, apiKey: "", apiSecret: "", domain: p.domain ?? "", region: p.region ?? "", config: p.config ? JSON.stringify(p.config, null, 2) : "" });
    setShowKey(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.slug) { toast({ title: "Nom et slug requis", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name, slug: form.slug, priority: form.priority, active: form.active,
        domain: form.domain || undefined, region: form.region || undefined,
        ...(form.apiKey    ? { apiKey:    form.apiKey    } : {}),
        ...(form.apiSecret ? { apiSecret: form.apiSecret } : {}),
        ...(form.config    ? { config: JSON.parse(form.config) } : {}),
      };
      if (editProvider) {
        await api("PUT", `/admin/email-providers/${editProvider.id}`, payload);
        toast({ title: "Fournisseur mis à jour ✓" });
      } else {
        await api("POST", "/admin/email-providers", payload);
        toast({ title: "Fournisseur créé ✓" });
      }
      setShowModal(false);
      await load();
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    try {
      await api("DELETE", `/admin/email-providers/${id}`);
      toast({ title: `${name} supprimé` });
      await load();
    } catch (e) {
      toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api("POST", `/admin/email-providers/${id}/toggle`);
      await load();
    } catch (e) {
      toast({ title: "Modification impossible", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleTest = async (id: string) => {
    if (!testEmail) { toast({ title: "Entrez un email de test", variant: "destructive" }); return; }
    setTestingId(id);
    try {
      const r = await api<{ success: boolean; messageId?: string; latencyMs: number; provider: string; error?: string }>(
        "POST", `/admin/email-providers/${id}/test`, { email: testEmail }
      );
      if (r.success) {
        toast({ title: `✅ Envoyé via ${r.provider} (${r.latencyMs}ms)`, description: r.messageId });
      } else {
        toast({ title: "Échec", description: r.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    } finally { setTestingId(null); }
  };

  const handleHealthCheck = async () => {
    setHealthChecking(true);
    try {
      await api("POST", "/admin/email-providers/health-check");
      toast({ title: "Health check terminé ✓" });
      await load();
    } catch (e) {
      toast({ title: "Health check impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setHealthChecking(false); }
  };

  const handleRetryPending = async () => {
    setRetrying(true);
    try {
      const r = await api<{ processed: number; dueAfter: number; message: string }>(
        "POST", "/admin/email-providers/retry-pending",
      );
      toast({ title: "File email traitée", description: `${r.processed} email(s) traité(s). ${r.message}` });
      await load();
      if (tab === "queue") await loadQueue();
    } catch (e) {
      toast({ title: "Reprise impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setRetrying(false); }
  };

  const handlePriorityChange = async (p: Provider, dir: "up" | "down") => {
    const delta = dir === "up" ? -1 : 1;
    try {
      await api("PUT", `/admin/email-providers/${p.id}`, { priority: Math.max(1, p.priority + delta) });
      await load();
    } catch (e) {
      toast({ title: "Priorité non modifiée", description: (e as Error).message, variant: "destructive" });
    }
  };

  const suggestSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);

  return (
    <AdminLayout>
      <div className="min-h-screen bg-[#0a0a0f] text-white px-4 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <Mail className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Fournisseurs Email</h1>
              <p className="text-xs text-zinc-500">Deux fournisseurs actifs possibles : priorité 1, puis secours automatique en cas d’échec confirmé</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleHealthCheck} disabled={healthChecking}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium border border-zinc-700 transition-colors disabled:opacity-50">
              {healthChecking ? <Loader2 className="w-4 h-4 animate-spin"/> : <Activity className="w-4 h-4"/>}
              Health check
            </button>
            <button onClick={handleRetryPending} disabled={retrying}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-sm font-medium border border-amber-500/30 transition-colors disabled:opacity-50">
              {retrying ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
              Reprendre la file
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">
              <Plus className="w-4 h-4"/> Ajouter
            </button>
          </div>
        </div>

        {/* ── Stats cards ── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Envoyés", value: stats.queue.sent, color: "text-emerald-400" },
              { label: "En attente", value: stats.queue.pending, color: "text-amber-400" },
              { label: "Échoués", value: stats.queue.failed, color: "text-red-400" },
              { label: "Tentatives", value: stats.totalAttempts, color: "text-violet-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString("fr-FR")}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 w-fit">
          {(["providers","stats","queue","logs"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white"}`}>
              {t === "providers" ? "Fournisseurs" : t === "stats" ? "Statistiques" : t === "queue" ? "File d'attente" : "Journaux"}
            </button>
          ))}
        </div>

        {/* ════════ TAB: PROVIDERS ════════ */}
        {tab === "providers" && (
          <div className="space-y-3">
            {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-violet-400"/></div>}
            {!loading && providers.length === 0 && (
              <div className="text-center py-16 text-zinc-500">
                <Mail className="w-12 h-12 mx-auto mb-3 opacity-30"/>
                <p className="font-medium">Aucun fournisseur configuré</p>
                <p className="text-sm mt-1">Ajoutez Resend, SES ou tout autre fournisseur pour commencer.</p>
              </div>
            )}
            {providers.map((p) => (
              <motion.div key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => handlePriorityChange(p, "up")} className="text-zinc-600 hover:text-zinc-300 transition-colors"><ChevronUp className="w-3 h-3"/></button>
                        <span className="text-xs text-center text-zinc-500 font-mono">#{p.priority}</span>
                        <button onClick={() => handlePriorityChange(p, "down")} className="text-zinc-600 hover:text-zinc-300 transition-colors"><ChevronDown className="w-3 h-3"/></button>
                      </div>
                      <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-violet-400"/>
                      </div>
                      <div>
                         <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-sm">{p.name}</span>
                          <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{p.slug}</code>
                           {p.role === "primary" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30 font-semibold">Principal</span>}
                           {p.role === "fallback" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold">Secours</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <HealthBadge status={p.healthStatus}/>
                          <span className="text-xs text-zinc-500">{p.totalSent.toLocaleString("fr-FR")} envoyés · {p.successRate}% succès</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Test input */}
                      <input value={testEmail} onChange={e => setTestEmail(e.target.value)}
                        placeholder="email de test" type="email"
                        className="hidden sm:block w-44 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500"/>
                      <button onClick={() => handleTest(p.id)} disabled={testingId === p.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-violet-600/20 border border-zinc-700 hover:border-violet-500/50 text-zinc-400 hover:text-violet-400 text-sm transition-colors disabled:opacity-50">
                        {testingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Send className="w-3.5 h-3.5"/>}
                        Tester
                      </button>
                       <button onClick={() => handleToggle(p.id)} title={p.active ? "Désactiver" : "Activer"}
                         className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-colors text-xs font-medium ${p.active ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400"}`}>
                        {p.active ? <ToggleRight className="w-4 h-4"/> : <ToggleLeft className="w-4 h-4"/>}
                         <span>{p.active ? "Désactiver" : "Activer"}</span>
                      </button>
                      <button onClick={() => openEdit(p)} className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white transition-colors">
                        <Pencil className="w-4 h-4"/>
                      </button>
                      <button onClick={() => handleDelete(p.id, p.name)} className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4"/>
                      </button>
                      <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white transition-colors">
                        <Info className="w-4 h-4"/>
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {expandedId === p.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                         <div><p className="text-zinc-500 text-xs mb-0.5">Clé API</p><p className="text-zinc-300 font-mono text-xs">{p.apiKeyMasked ?? "—"}{p.apiKeySource === "environment" && <span className="ml-1 text-emerald-400">(Plesk)</span>}</p></div>
                         <div><p className="text-zinc-500 text-xs mb-0.5">Expéditeur</p><p className="text-zinc-300 text-xs">{p.senderName ? `${p.senderName} — ` : ""}{p.senderEmail ?? "—"}</p></div>
                        <div><p className="text-zinc-500 text-xs mb-0.5">Secret</p><p className="text-zinc-300 text-xs">{p.hasApiSecret ? "✓ configuré" : "—"}</p></div>
                        <div><p className="text-zinc-500 text-xs mb-0.5">Domaine</p><p className="text-zinc-300 text-xs">{p.domain ?? "—"}</p></div>
                        <div><p className="text-zinc-500 text-xs mb-0.5">Région</p><p className="text-zinc-300 text-xs">{p.region ?? "—"}</p></div>
                        <div><p className="text-zinc-500 text-xs mb-0.5">Erreurs consécutives</p><p className={`text-xs font-semibold ${p.consecutiveErrors > 0 ? "text-red-400" : "text-emerald-400"}`}>{p.consecutiveErrors}</p></div>
                        <div><p className="text-zinc-500 text-xs mb-0.5">Total échoués</p><p className="text-zinc-300 text-xs">{p.totalFailed.toLocaleString("fr-FR")}</p></div>
                        {p.lastError && <div className="col-span-2"><p className="text-zinc-500 text-xs mb-0.5">Dernière erreur</p><p className="text-red-400 text-xs truncate">{p.lastError}</p></div>}
                        {p.lastHealthCheck && <div><p className="text-zinc-500 text-xs mb-0.5">Dernier check</p><p className="text-zinc-300 text-xs">{new Date(p.lastHealthCheck).toLocaleString("fr-FR")}</p></div>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}

            {/* Test email input (mobile) */}
            <div className="sm:hidden">
              <input value={testEmail} onChange={e => setTestEmail(e.target.value)}
                placeholder="Email de test" type="email"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500"/>
            </div>
          </div>
        )}

        {/* ════════ TAB: STATS ════════ */}
        {tab === "stats" && stats && (
          <div className="space-y-4">
            {stats.providers.map(p => (
              <div key={p.id} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="font-semibold text-white">{p.name}</span>
                    <code className="ml-2 text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{p.slug}</code>
                  </div>
                  <HealthBadge status={p.healthStatus}/>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><p className="text-zinc-500 text-xs">Envoyés</p><p className="text-emerald-400 font-bold text-lg">{p.totalSent.toLocaleString()}</p></div>
                  <div><p className="text-zinc-500 text-xs">Échoués</p><p className="text-red-400 font-bold text-lg">{p.totalFailed.toLocaleString()}</p></div>
                  <div><p className="text-zinc-500 text-xs">Succès</p><p className="text-violet-400 font-bold text-lg">{p.successRate}%</p></div>
                </div>
                {/* Progress bar */}
                <div className="mt-4 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-600 to-emerald-500 rounded-full transition-all" style={{ width: `${p.successRate}%` }}/>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════════ TAB: QUEUE ════════ */}
        {tab === "queue" && (
          <div className="space-y-2">
            <div className="flex justify-end"><button onClick={loadQueue} className="text-xs text-zinc-500 hover:text-white flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Actualiser</button></div>
            {queue.length === 0 && <p className="text-center text-zinc-500 py-12">File d'attente vide</p>}
            {queue.map(item => (
              <div key={item.id} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium text-white">{item.toEmail}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.subject}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${item.status === "sent" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : item.status === "failed" ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400"}`}>
                    {item.status}
                  </span>
                  <span className="text-xs text-zinc-500">{item.attempts}/{item.maxAttempts} tentatives</span>
                  <span className="text-xs text-zinc-600">{new Date(item.createdAt).toLocaleString("fr-FR")}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════════ TAB: LOGS ════════ */}
        {tab === "logs" && (
          <div className="space-y-2">
            <div className="flex justify-end"><button onClick={loadLogs} className="text-xs text-zinc-500 hover:text-white flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Actualiser</button></div>
            {logs.length === 0 && <p className="text-center text-zinc-500 py-12">Aucun journal disponible</p>}
            {logs.map(log => (
              <div key={log.id} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  {log.status === "success"
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0"/>
                    : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0"/>}
                  <div>
                    <p className="text-sm text-white">{log.toEmail ?? "—"}</p>
                    <p className="text-xs text-zinc-500">{log.subject ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {log.providerName && <code className="bg-zinc-800 px-2 py-0.5 rounded text-violet-400">{log.providerName}</code>}
                  {log.latencyMs !== null && <span className="text-zinc-500">{log.latencyMs}ms</span>}
                  {log.error && <span className="text-red-400 max-w-xs truncate">{log.error}</span>}
                  <span className="text-zinc-600">{new Date(log.attemptedAt).toLocaleString("fr-FR")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ════════ MODAL CRÉATION / ÉDITION ════════ */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-lg font-bold text-white mb-5">{editProvider ? "Modifier le fournisseur" : "Ajouter un fournisseur"}</h2>

                {/* Quick-select template */}
                {!editProvider && (
                  <div className="mb-5">
                    <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Choisir un modèle</p>
                    <div className="flex flex-wrap gap-2">
                      {supported.map(s => (
                        <button key={s.slug} onClick={() => setForm(f => ({ ...f, name: s.name, slug: s.slug }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.slug === s.slug ? "bg-violet-600 border-violet-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-violet-500/50"}`}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Nom *</label>
                      <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: editProvider ? f.slug : suggestSlug(e.target.value) }))}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"/>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Slug *</label>
                      <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-violet-500"/>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Priorité (1 = plus haute)</label>
                      <input type="number" min={1} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"/>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                          className={`w-10 h-6 rounded-full transition-colors ${form.active ? "bg-emerald-500" : "bg-zinc-700"} relative`}>
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.active ? "left-5" : "left-1"}`}/>
                        </div>
                        <span className="text-sm text-zinc-300">{form.active ? "Actif" : "Inactif"}</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400 mb-1 flex items-center gap-1.5 justify-between">
                      <span>Clé API {editProvider && <span className="text-zinc-600">(laisser vide pour ne pas changer)</span>}</span>
                      <button type="button" onClick={() => setShowKey(!showKey)} className="text-zinc-500 hover:text-zinc-300">
                        {showKey ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                      </button>
                    </label>
                    <input type={showKey ? "text" : "password"} value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                      placeholder={editProvider ? "••••••• (non modifié)" : "re_xxxx..."}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-violet-500"/>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Secret (Mailjet, SES…)</label>
                    <input type="password" value={form.apiSecret} onChange={e => setForm(f => ({ ...f, apiSecret: e.target.value }))}
                      placeholder={editProvider && editProvider.hasApiSecret ? "••••••• (non modifié)" : "optionnel"}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-violet-500"/>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Domaine (Mailgun)</label>
                      <input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                        placeholder="mg.simix.site"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"/>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Région (SES)</label>
                      <input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                        placeholder="us-east-1"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"/>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Config JSON (optionnel)</label>
                    <textarea value={form.config} onChange={e => setForm(f => ({ ...f, config: e.target.value }))}
                      rows={3} placeholder='{"key": "value"}'
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-violet-500 resize-none"/>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors">
                    Annuler
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
                    {editProvider ? "Mettre à jour" : "Créer"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
