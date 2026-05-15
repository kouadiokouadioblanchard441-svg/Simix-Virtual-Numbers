import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminLayout } from "@/components/admin-layout";
import { adminToken } from "@/lib/admin-token";
import { LogoField } from "@/components/image-upload-button";
import {
  Route, Server, Cpu, FileText, Plus, Pencil, Trash2,
  CheckCircle, XCircle, Clock, Wifi, WifiOff, AlertTriangle,
  ChevronDown, Search, Shield, ArrowRightLeft, Wrench, Loader2,
  RefreshCw, Globe, Zap, ToggleLeft, ToggleRight, Eye, EyeOff,
} from "lucide-react";

const BASE = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/api";
const H = () => ({ Authorization: `Bearer ${adminToken.get() ?? ""}`, "Content-Type": "application/json" });

/* Wrapper fetch qui redirige vers /admin/secure-login sur 401 */
async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    adminToken.clear();
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    window.location.href = `${base}/admin/secure-login`;
  }
  return res;
}

/* ─── Types ────────────────────────────────────────────────── */
interface Gateway {
  id: string; name: string; slug: string; logoUrl: string | null;
  apiUrl: string | null; apiKey: string | null; apiSecret: string | null;
  webhookSecret: string | null; type: string; supportedCountries: string[];
  supportedOperators: string[]; active: boolean; testMode: boolean;
  notes: string | null; createdAt: string;
}
interface Operator {
  id: string; name: string; slug: string; logoUrl: string | null;
  color: string; countryCodes: string[]; active: boolean; sortOrder: number;
}
interface PayRoute {
  id: string; countryCode: string; operatorSlug: string; transactionType: string;
  primaryGatewayId: string | null; secondaryGatewayId: string | null;
  tertiaryGatewayId: string | null; active: boolean;
  maintenanceMode: boolean; maintenanceMessage: string | null; notes: string | null;
  primaryGateway: { id: string; name: string; slug: string; active: boolean } | null;
  secondaryGateway: { id: string; name: string; slug: string; active: boolean } | null;
  tertiaryGateway: { id: string; name: string; slug: string; active: boolean } | null;
  operator: { name: string; slug: string } | null;
}
interface RouteLog {
  id: string; eventType: string; status: string; responseTimeMs: number | null;
  errorMessage: string | null; adminId: string | null; createdAt: string;
  metadata: Record<string, unknown> | null; gatewayId: string | null;
}
interface Stats {
  gateways: { total: number; active: number };
  operators: { total: number };
  routes: { total: number; active: number; maintenance: number };
}

/* ─── Utils ─────────────────────────────────────────────────── */
const TABS = [
  { id: "routing", label: "Routage", icon: Route },
  { id: "gateways", label: "Fournisseurs", icon: Server },
  { id: "operators", label: "Opérateurs", icon: Cpu },
  { id: "logs", label: "Journaux", icon: FileText },
];

const TYPE_LABELS: Record<string, string> = {
  deposit: "Dépôt", withdrawal: "Retrait", both: "Les deux",
};
const STATUS_COLOR: Record<string, string> = {
  connected: "text-emerald-400", error: "text-red-400",
  timeout: "text-amber-400", no_url: "text-zinc-400",
};

function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
      active ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
              : "bg-red-500/15 text-red-400 border border-red-500/25"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-red-400"}`} />
      {label ?? (active ? "Actif" : "Inactif")}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-zinc-900/60 border border-zinc-800/80 rounded-2xl ${className}`}>
      {children}
    </div>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1 font-medium">{label}</label>
      <input {...props} className={`w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60 ${props.className ?? ""}`} />
    </div>
  );
}

function Select({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1 font-medium">{label}</label>
      <select {...props} className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60">
        {children}
      </select>
    </div>
  );
}

/* ─── Modal shell ────────────────────────────────────────────── */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <h3 className="text-white font-bold text-sm">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GATEWAYS TAB
   ═══════════════════════════════════════════════════════════════ */
function GatewaysTab() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "create" | Gateway>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: string; message: string; responseTimeMs?: number }>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Partial<Gateway & { apiKeyRaw: string; apiSecretRaw: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${BASE()}/admin/payment-routing/gateways`, { headers: H() });
      const d = await r.json();
      setGateways(d.gateways ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setForm({ type: "both", active: true, testMode: false }); setModal("create"); };
  const openEdit = (g: Gateway) => { setForm({ ...g }); setModal(g); };

  const save = async () => {
    const isEdit = modal !== "create";
    const body = {
      name: form.name, slug: form.slug, logoUrl: form.logoUrl,
      apiUrl: form.apiUrl, apiKey: form.apiKey, apiSecret: form.apiSecret,
      webhookSecret: form.webhookSecret, type: form.type,
      supportedCountries: form.supportedCountries ?? [],
      supportedOperators: form.supportedOperators ?? [],
      active: form.active, testMode: form.testMode, notes: form.notes,
    };
    const url = isEdit ? `${BASE()}/admin/payment-routing/gateways/${(modal as Gateway).id}` : `${BASE()}/admin/payment-routing/gateways`;
    await apiFetch(url, { method: isEdit ? "PUT" : "POST", headers: H(), body: JSON.stringify(body) });
    setModal(null);
    void load();
  };

  const del = async (id: string) => {
    if (!confirm("Supprimer ce fournisseur ?")) return;
    await apiFetch(`${BASE()}/admin/payment-routing/gateways/${id}`, { method: "DELETE", headers: H() });
    void load();
  };

  const testGateway = async (id: string) => {
    setTesting(id);
    try {
      const r = await apiFetch(`${BASE()}/admin/payment-routing/gateways/${id}/test`, { method: "POST", headers: H() });
      const d = await r.json();
      setTestResults(p => ({ ...p, [id]: d }));
    } finally { setTesting(null); }
  };

  const filtered = gateways.filter(g =>
    search === "" || g.name.toLowerCase().includes(search.toLowerCase()) || g.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60" />
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-white text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(g => {
            const test = testResults[g.id];
            return (
              <Card key={g.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Server className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold text-sm">{g.name}</span>
                      <code className="text-[10px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">{g.slug}</code>
                      <StatusBadge active={g.active} />
                      {g.testMode && <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full font-bold">Test</span>}
                      <span className="text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/25 px-2 py-0.5 rounded-full font-bold">{TYPE_LABELS[g.type] ?? g.type}</span>
                    </div>
                    {g.apiUrl && <p className="text-xs text-zinc-500 mt-0.5 truncate">{g.apiUrl}</p>}
                    {g.notes && <p className="text-xs text-zinc-500 mt-1">{g.notes}</p>}
                    {test && (
                      <div className={`text-xs mt-1 flex items-center gap-1.5 ${STATUS_COLOR[test.status] ?? "text-zinc-400"}`}>
                        {test.status === "connected" ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {test.message}
                        {test.responseTimeMs && <span className="text-zinc-500">· {test.responseTimeMs}ms</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => testGateway(g.id)} disabled={testing === g.id} className="px-2.5 py-1.5 bg-zinc-800 hover:bg-blue-500/20 border border-zinc-700/60 hover:border-blue-500/40 text-zinc-400 hover:text-blue-400 rounded-lg text-xs transition-colors flex items-center gap-1">
                      {testing === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                      Tester
                    </button>
                    <button onClick={() => openEdit(g)} className="p-1.5 hover:bg-violet-500/15 rounded-lg text-zinc-500 hover:text-violet-400 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del(g.id)} className="p-1.5 hover:bg-red-500/15 rounded-lg text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-zinc-500">Aucun fournisseur trouvé</div>
          )}
        </div>
      )}

      <AnimatePresence>
        {modal !== null && (
          <Modal title={modal === "create" ? "Nouveau fournisseur" : `Modifier — ${(modal as Gateway).name}`} onClose={() => setModal(null)}>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nom *" value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Fapshi" />
              <Input label="Slug *" value={form.slug ?? ""} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} placeholder="fapshi" />
            </div>
            <Input label="URL API" value={form.apiUrl ?? ""} onChange={e => setForm(p => ({ ...p, apiUrl: e.target.value }))} placeholder="https://api.fapshi.com" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Clé API" type="password" value={form.apiKey ?? ""} onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="sk_live_…" />
              <Input label="Secret API" type="password" value={form.apiSecret ?? ""} onChange={e => setForm(p => ({ ...p, apiSecret: e.target.value }))} placeholder="secret_…" />
            </div>
            <Input label="Webhook Secret" type="password" value={form.webhookSecret ?? ""} onChange={e => setForm(p => ({ ...p, webhookSecret: e.target.value }))} placeholder="whsec_…" />
            <Select label="Type" value={form.type ?? "both"} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="deposit">Dépôt uniquement</option>
              <option value="withdrawal">Retrait uniquement</option>
              <option value="both">Dépôt et retrait</option>
            </Select>
            <LogoField
              label="Logo du fournisseur"
              value={form.logoUrl ?? ""}
              onChange={v => setForm(p => ({ ...p, logoUrl: v }))}
              authHeader={{ Authorization: `Bearer ${adminToken.get() ?? ""}` }}
              placeholder="https://… ou uploader →"
            />
            <div className="space-y-1">
              <label className="block text-xs text-zinc-400 font-medium">Notes internes</label>
              <textarea value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Notes, documentation, remarques…" className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60 resize-none" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active ?? true} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="accent-violet-500" />
                <span className="text-sm text-zinc-300">Actif</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.testMode ?? false} onChange={e => setForm(p => ({ ...p, testMode: e.target.checked }))} className="accent-amber-500" />
                <span className="text-sm text-zinc-300">Mode test</span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Annuler</button>
              <button onClick={save} className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">Enregistrer</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OPERATORS TAB
   ═══════════════════════════════════════════════════════════════ */
function OperatorsTab() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "create" | Operator>(null);
  const [form, setForm] = useState<Partial<Operator>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${BASE()}/admin/payment-routing/operators`, { headers: H() });
      const d = await r.json();
      setOperators(d.operators ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const isEdit = modal !== "create";
    const body = {
      name: form.name, slug: form.slug, logoUrl: form.logoUrl,
      color: form.color, countryCodes: form.countryCodes ?? [],
      active: form.active, sortOrder: form.sortOrder,
    };
    const url = isEdit ? `${BASE()}/admin/payment-routing/operators/${(modal as Operator).id}` : `${BASE()}/admin/payment-routing/operators`;
    await apiFetch(url, { method: isEdit ? "PUT" : "POST", headers: H(), body: JSON.stringify(body) });
    setModal(null);
    void load();
  };

  const del = async (id: string) => {
    if (!confirm("Supprimer cet opérateur ?")) return;
    await apiFetch(`${BASE()}/admin/payment-routing/operators/${id}`, { method: "DELETE", headers: H() });
    void load();
  };

  const toggleActive = async (op: Operator) => {
    await apiFetch(`${BASE()}/admin/payment-routing/operators/${op.id}`, {
      method: "PUT", headers: H(),
      body: JSON.stringify({ active: !op.active }),
    });
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setForm({ color: "#6B7280", active: true, sortOrder: 100, countryCodes: [] }); setModal("create"); }} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-white text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {operators.map(op => (
            <Card key={op.id} className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: op.color + "25", border: `1px solid ${op.color}40` }}>
                  <span className="text-xs font-bold" style={{ color: op.color }}>{op.name.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{op.name}</p>
                  <code className="text-[10px] text-zinc-500">{op.slug}</code>
                </div>
                <button onClick={() => toggleActive(op)}>
                  {op.active ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-zinc-600" />}
                </button>
              </div>
              {(op.countryCodes as string[]).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {(op.countryCodes as string[]).slice(0, 6).map((cc: string) => (
                    <span key={cc} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{cc}</span>
                  ))}
                  {(op.countryCodes as string[]).length > 6 && <span className="text-[10px] text-zinc-600">+{(op.countryCodes as string[]).length - 6}</span>}
                </div>
              )}
              <div className="flex gap-1.5">
                <button onClick={() => { setForm({ ...op }); setModal(op); }} className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-1"><Pencil className="w-3 h-3" />Modifier</button>
                <button onClick={() => del(op.id)} className="p-1.5 hover:bg-red-500/15 rounded-lg text-zinc-600 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AnimatePresence>
        {modal !== null && (
          <Modal title={modal === "create" ? "Nouvel opérateur" : `Modifier — ${(modal as Operator).name}`} onClose={() => setModal(null)}>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nom *" value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="MTN Mobile Money" />
              <Input label="Slug *" value={form.slug ?? ""} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} placeholder="mtn" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1 font-medium">Couleur</label>
                <div className="flex gap-2">
                  <input type="color" value={form.color ?? "#6B7280"} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer" />
                  <input value={form.color ?? ""} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="flex-1 bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60" placeholder="#FFCC00" />
                </div>
              </div>
              <Input label="Ordre" type="number" value={form.sortOrder ?? 100} onChange={e => setForm(p => ({ ...p, sortOrder: Number(e.target.value) }))} />
            </div>
            <LogoField
              label="Logo de l'opérateur"
              value={form.logoUrl ?? ""}
              onChange={v => setForm(p => ({ ...p, logoUrl: v }))}
              authHeader={{ Authorization: `Bearer ${adminToken.get() ?? ""}` }}
              placeholder="https://… ou uploader →"
              previewBg={form.color ?? "transparent"}
            />
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">Pays (codes ISO séparés par virgule)</label>
              <input
                value={(form.countryCodes as string[] ?? []).join(",")}
                onChange={e => setForm(p => ({ ...p, countryCodes: e.target.value.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) }))}
                className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60"
                placeholder="CI,CM,SN,GH"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active ?? true} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="accent-violet-500" />
              <span className="text-sm text-zinc-300">Actif</span>
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Annuler</button>
              <button onClick={save} className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">Enregistrer</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROUTING TAB — Country → Operator → Gateway matrix view
   ═══════════════════════════════════════════════════════════════ */
interface GwBasic { id: string; name: string; slug: string; active: boolean; logoUrl: string | null; testMode: boolean; }
interface RouteBasic {
  id: string; countryCode: string; operatorSlug: string; transactionType: string;
  primaryGatewayId: string | null; secondaryGatewayId: string | null; tertiaryGatewayId: string | null;
  active: boolean; maintenanceMode: boolean; maintenanceMessage: string | null;
}
interface CountryEntry { code: string; name: string; flag: string; operatorSlugs: string[]; }
type RouteKey = string;

function RoutingTab() {
  const [countries, setCountries] = useState<CountryEntry[]>([]);
  const [operatorMap, setOperatorMap] = useState<Record<string, Operator>>({});
  const [gateways, setGateways] = useState<GwBasic[]>([]);
  const [routeMap, setRouteMap] = useState<Record<RouteKey, RouteBasic>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedOk, setSavedOk] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [showFallback, setShowFallback] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${BASE()}/admin/payment-routing/matrix`, { headers: H() });
      const d = await r.json();
      const ctrs: CountryEntry[] = d.countries ?? [];
      const ops: Operator[] = d.operators ?? [];
      const rts: RouteBasic[] = d.routes ?? [];
      const opMap: Record<string, Operator> = {};
      for (const op of ops) opMap[op.slug] = op;
      const rMap: Record<string, RouteBasic> = {};
      for (const rt of rts) rMap[`${rt.countryCode}:${rt.operatorSlug}:${rt.transactionType}`] = rt;
      setCountries(ctrs);
      setOperatorMap(opMap);
      setGateways(d.gateways ?? []);
      setRouteMap(rMap);
      const exp: Record<string, boolean> = {};
      ctrs.forEach((c, i) => { exp[c.code] = i < 5; });
      setExpanded(exp);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const upsertRoute = async (
    countryCode: string, operatorSlug: string,
    primaryGatewayId: string | null,
    secondaryGatewayId?: string | null,
    tertiaryGatewayId?: string | null,
  ) => {
    const rowKey = `${countryCode}:${operatorSlug}`;
    const routeKey = `${countryCode}:${operatorSlug}:deposit`;
    setRouteMap(prev => {
      const ex = prev[routeKey];
      return {
        ...prev,
        [routeKey]: {
          ...(ex ?? { id: "", countryCode, operatorSlug, transactionType: "deposit", active: true, maintenanceMode: false, maintenanceMessage: null }),
          primaryGatewayId,
          secondaryGatewayId: secondaryGatewayId !== undefined ? secondaryGatewayId : (ex?.secondaryGatewayId ?? null),
          tertiaryGatewayId: tertiaryGatewayId !== undefined ? tertiaryGatewayId : (ex?.tertiaryGatewayId ?? null),
        } as RouteBasic,
      };
    });
    setSaving(p => ({ ...p, [rowKey]: true }));
    try {
      const r = await apiFetch(`${BASE()}/admin/payment-routing/routes/upsert`, {
        method: "POST", headers: H(),
        body: JSON.stringify({
          countryCode, operatorSlug, transactionType: "deposit",
          primaryGatewayId,
          ...(secondaryGatewayId !== undefined && { secondaryGatewayId }),
          ...(tertiaryGatewayId !== undefined && { tertiaryGatewayId }),
        }),
      });
      const d = await r.json();
      if (d.success && d.route) {
        setRouteMap(p => ({ ...p, [routeKey]: d.route as RouteBasic }));
        setSavedOk(p => ({ ...p, [rowKey]: true }));
        setTimeout(() => setSavedOk(p => { const n = { ...p }; delete n[rowKey]; return n; }), 2000);
      }
    } catch { void load(); }
    finally { setSaving(p => { const n = { ...p }; delete n[rowKey]; return n; }); }
  };

  const toggleMaintenance = async (countryCode: string, operatorSlug: string) => {
    const routeKey = `${countryCode}:${operatorSlug}:deposit`;
    const route = routeMap[routeKey];
    if (!route?.id) return;
    const newMode = !route.maintenanceMode;
    setRouteMap(p => ({ ...p, [routeKey]: { ...p[routeKey]!, maintenanceMode: newMode } }));
    await apiFetch(`${BASE()}/admin/payment-routing/routes/${route.id}/maintenance`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ maintenanceMode: newMode }),
    });
  };

  const toggleExpand = (code: string) => setExpanded(p => ({ ...p, [code]: !p[code] }));
  const expandAll = () => { const e: Record<string, boolean> = {}; countries.forEach(c => { e[c.code] = true; }); setExpanded(e); };
  const collapseAll = () => setExpanded({});
  const activeGateways = gateways.filter(g => g.active);
  const filteredCountries = countries.filter(c =>
    search === "" || c.code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un pays…"
            className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60"
          />
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={expandAll} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors">
            Tout ouvrir
          </button>
          <button onClick={collapseAll} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors">
            Tout fermer
          </button>
          <button onClick={load} className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-xl text-zinc-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* No active gateways warning */}
      {activeGateways.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 text-sm text-amber-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          Aucun fournisseur actif. Activez d'abord un fournisseur dans l'onglet "Fournisseurs".
        </div>
      )}

      {/* Summary bar */}
      <p className="text-xs text-zinc-500">
        {filteredCountries.length} pays · {Object.keys(routeMap).length} routes · {activeGateways.length} fournisseur{activeGateways.length !== 1 ? "s" : ""} actif{activeGateways.length !== 1 ? "s" : ""}
      </p>

      {/* Country accordion cards */}
      <div className="space-y-3">
        {filteredCountries.map(country => {
          const isOpen = expanded[country.code] ?? false;
          const configuredCount = country.operatorSlugs.filter(s => routeMap[`${country.code}:${s}:deposit`]?.primaryGatewayId != null).length;
          const total = country.operatorSlugs.length;
          const pct = total > 0 ? Math.round((configuredCount / total) * 100) : 0;

          return (
            <Card key={country.code} className="overflow-hidden">
              <button
                onClick={() => toggleExpand(country.code)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left"
              >
                <span className="text-2xl flex-shrink-0 leading-none">{country.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-sm">{country.name}</span>
                    <code className="text-[10px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">{country.code}</code>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{configuredCount}/{total} opérateur{total !== 1 ? "s" : ""} configuré{configuredCount !== 1 ? "s" : ""}</p>
                </div>
                <div className="hidden sm:flex items-center gap-2 mr-3">
                  <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-violet-500" : "bg-zinc-700"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-zinc-500 w-8 text-right">{pct}%</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="px-3 pb-3 border-t border-zinc-800/60">
                  <div className="pt-3 space-y-2">
                    {country.operatorSlugs.map(slug => {
                      const rowKey = `${country.code}:${slug}`;
                      const routeKey = `${country.code}:${slug}:deposit`;
                      const route = routeMap[routeKey];
                      const isSaving = saving[rowKey] ?? false;
                      const isSaved = savedOk[rowKey] ?? false;
                      const fallbackOpen = showFallback[rowKey] ?? false;
                      const operator = operatorMap[slug];

                      return (
                        <div key={slug} className="rounded-xl bg-zinc-800/30 border border-zinc-800/60 hover:border-zinc-700/60 transition-colors overflow-hidden">
                          <div className="flex items-center gap-3 p-3 flex-wrap">
                            <div className="flex items-center gap-2 w-28 flex-shrink-0">
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                                style={{ backgroundColor: (operator?.color ?? "#6B7280") + "20", border: `1px solid ${operator?.color ?? "#6B7280"}40` }}
                              >
                                <span style={{ color: operator?.color ?? "#9CA3AF" }}>{slug.slice(0, 2).toUpperCase()}</span>
                              </div>
                              <p className="text-white text-[11px] font-bold truncate">{operator?.name ?? slug}</p>
                            </div>

                            <div className="flex flex-wrap gap-1.5 flex-1">
                              {activeGateways.map(gw => {
                                const isActive = route?.primaryGatewayId === gw.id;
                                return (
                                  <button
                                    key={gw.id}
                                    onClick={() => upsertRoute(country.code, slug, isActive ? null : gw.id)}
                                    disabled={isSaving}
                                    title={isActive ? `Désactiver ${gw.name}` : `Utiliser ${gw.name}`}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isActive ? "bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-500/20" : "bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:border-violet-500/40 hover:text-zinc-200 hover:bg-zinc-800"}`}
                                  >
                                    {isSaving && isActive ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : isSaved && isActive ? <CheckCircle className="w-3 h-3 text-emerald-300" />
                                        : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-white" : "bg-zinc-600"}`} />}
                                    {gw.name}
                                    {gw.testMode && <span className="text-[8px] bg-amber-500/25 text-amber-400 px-1 rounded">TEST</span>}
                                  </button>
                                );
                              })}
                              {activeGateways.length === 0 && <span className="text-xs text-zinc-600 italic">Aucun fournisseur actif</span>}
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {route?.maintenanceMode && (
                                <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  <Wrench className="w-2.5 h-2.5" />Maint.
                                </span>
                              )}
                              {!route?.primaryGatewayId && <span className="text-[10px] text-zinc-600 italic hidden sm:inline">Non configuré</span>}
                              {gateways.length > 1 && (
                                <button
                                  onClick={() => setShowFallback(p => ({ ...p, [rowKey]: !p[rowKey] }))}
                                  className={`text-[10px] flex items-center gap-0.5 px-2 py-1 rounded-lg border transition-colors ${fallbackOpen ? "bg-violet-600/15 border-violet-500/30 text-violet-400" : "bg-zinc-800/60 border-zinc-700/60 text-zinc-500 hover:text-violet-400 hover:border-violet-500/30"}`}
                                >
                                  <ChevronDown className={`w-3 h-3 transition-transform ${fallbackOpen ? "rotate-180" : ""}`} />
                                  Fallback
                                </button>
                              )}
                            </div>
                          </div>

                          {fallbackOpen && (
                            <div className="flex items-center gap-4 px-3 py-2.5 border-t border-zinc-800/60 bg-zinc-900/50 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-500 font-semibold w-10">2ème :</span>
                                <select
                                  value={route?.secondaryGatewayId ?? ""}
                                  onChange={e => upsertRoute(country.code, slug, route?.primaryGatewayId ?? null, e.target.value || null)}
                                  className="bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-violet-500/60"
                                >
                                  <option value="">— Aucun —</option>
                                  {gateways.filter(g => g.id !== route?.primaryGatewayId).map(g => (
                                    <option key={g.id} value={g.id}>{g.name}{!g.active ? " ✗" : ""}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-500 font-semibold w-10">3ème :</span>
                                <select
                                  value={route?.tertiaryGatewayId ?? ""}
                                  onChange={e => upsertRoute(country.code, slug, route?.primaryGatewayId ?? null, route?.secondaryGatewayId, e.target.value || null)}
                                  className="bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-violet-500/60"
                                >
                                  <option value="">— Aucun —</option>
                                  {gateways.filter(g => g.id !== route?.primaryGatewayId && g.id !== route?.secondaryGatewayId).map(g => (
                                    <option key={g.id} value={g.id}>{g.name}{!g.active ? " ✗" : ""}</option>
                                  ))}
                                </select>
                              </div>
                              {route?.id && (
                                <button
                                  onClick={() => toggleMaintenance(country.code, slug)}
                                  className={`ml-auto text-[10px] flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors ${route.maintenanceMode ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-zinc-800 border-zinc-700/60 text-zinc-500 hover:border-amber-500/30 hover:text-amber-400"}`}
                                >
                                  <Wrench className="w-3 h-3" />
                                  {route.maintenanceMode ? "Désactiver maintenance" : "Mode maintenance"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {filteredCountries.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            {search ? `Aucun pays correspondant à "${search}"` : "Aucun opérateur configuré. Ajoutez des opérateurs dans l'onglet Opérateurs."}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LOGS TAB
   ═══════════════════════════════════════════════════════════════ */
function LogsTab() {
  const [logs, setLogs] = useState<RouteLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filterType) params.set("eventType", filterType);
      if (filterStatus) params.set("status", filterStatus);
      const r = await apiFetch(`${BASE()}/admin/payment-routing/logs?${params}`, { headers: H() });
      const d = await r.json();
      setLogs(d.logs ?? []);
      setTotal(d.total ?? 0);
    } finally { setLoading(false); }
  }, [filterType, filterStatus]);

  useEffect(() => { void load(); }, [load]);

  const EVENT_COLORS: Record<string, string> = {
    payment: "text-blue-400", test: "text-violet-400", route_created: "text-emerald-400",
    route_updated: "text-amber-400", gateway_switch: "text-orange-400",
    maintenance_on: "text-red-400", maintenance_off: "text-emerald-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
          <option value="">Tous les événements</option>
          <option value="payment">Paiements</option>
          <option value="test">Tests API</option>
          <option value="gateway_switch">Bascules</option>
          <option value="route_created">Créations</option>
          <option value="route_updated">Modifications</option>
          <option value="maintenance_on">Maintenance ON</option>
          <option value="maintenance_off">Maintenance OFF</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
          <option value="">Tous les statuts</option>
          <option value="success">Succès</option>
          <option value="error">Erreur</option>
          <option value="timeout">Timeout</option>
        </select>
        <button onClick={load} className="p-2 text-zinc-500 hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>
        <span className="ml-auto text-xs text-zinc-500">{total} événements total</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : (
        <Card>
          <div className="divide-y divide-zinc-800/40">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/20 transition-colors">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.status === "success" ? "bg-emerald-400" : log.status === "timeout" ? "bg-amber-400" : "bg-red-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold ${EVENT_COLORS[log.eventType] ?? "text-zinc-400"}`}>{log.eventType}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${log.status === "success" ? "bg-emerald-500/15 text-emerald-400" : log.status === "timeout" ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>{log.status}</span>
                    {log.responseTimeMs !== null && <span className="text-[10px] text-zinc-600">{log.responseTimeMs}ms</span>}
                    {log.adminId && <span className="text-[10px] text-zinc-600">par {log.adminId.slice(0, 8)}…</span>}
                  </div>
                  {log.errorMessage && <p className="text-xs text-red-400/80 mt-0.5">{log.errorMessage}</p>}
                </div>
                <span className="text-[10px] text-zinc-600 flex-shrink-0">
                  {new Date(log.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
            {logs.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">Aucun journal trouvé</div>}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function AdminRouting() {
  const [activeTab, setActiveTab] = useState("routing");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`${BASE()}/admin/payment-routing/stats`, { headers: H() })
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {});
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Routage des paiements</h1>
          <p className="text-zinc-500 text-sm mt-1">Gérez dynamiquement les fournisseurs API selon le pays, l'opérateur et le type de transaction</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Fournisseurs actifs", value: `${stats.gateways.active}/${stats.gateways.total}`, icon: Server, color: "text-violet-400" },
              { label: "Opérateurs", value: stats.operators.total, icon: Cpu, color: "text-blue-400" },
              { label: "Routes actives", value: `${stats.routes.active}/${stats.routes.total}`, icon: Route, color: "text-emerald-400" },
              { label: "En maintenance", value: stats.routes.maintenance, icon: Wrench, color: stats.routes.maintenance > 0 ? "text-amber-400" : "text-zinc-600" },
            ].map(s => (
              <Card key={s.label} className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center ${s.color}`}>
                    <s.icon className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg leading-none">{s.value}</p>
                    <p className="text-zinc-500 text-[11px] mt-0.5">{s.label}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-zinc-800/80">
          <div className="flex gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "text-white border-violet-500"
                    : "text-zinc-500 border-transparent hover:text-zinc-300"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {activeTab === "routing" && <RoutingTab />}
            {activeTab === "gateways" && <GatewaysTab />}
            {activeTab === "operators" && <OperatorsTab />}
            {activeTab === "logs" && <LogsTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </AdminLayout>
  );
}
