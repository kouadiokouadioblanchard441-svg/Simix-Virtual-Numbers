import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminLayout } from "@/components/admin-layout";
import { adminToken } from "@/lib/admin-token";
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
            <div className="grid grid-cols-2 gap-3">
              <Select label="Type" value={form.type ?? "both"} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="deposit">Dépôt uniquement</option>
                <option value="withdrawal">Retrait uniquement</option>
                <option value="both">Dépôt et retrait</option>
              </Select>
              <Input label="Logo URL" value={form.logoUrl ?? ""} onChange={e => setForm(p => ({ ...p, logoUrl: e.target.value }))} placeholder="https://…" />
            </div>
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
   ROUTING TAB
   ═══════════════════════════════════════════════════════════════ */
function RoutingTab() {
  const [routes, setRoutes] = useState<PayRoute[]>([]);
  const [gateways, setGateways] = useState<{ id: string; name: string; slug: string; active: boolean }[]>([]);
  const [operators, setOperators] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "create" | PayRoute>(null);
  const [switchModal, setSwitchModal] = useState<PayRoute | null>(null);
  const [form, setForm] = useState<Partial<PayRoute & { notes: string }>>({});
  const [filterCountry, setFilterCountry] = useState("");
  const [filterOp, setFilterOp] = useState("");
  const [filterType, setFilterType] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCountry) params.set("country", filterCountry);
      if (filterOp) params.set("operator", filterOp);
      if (filterType) params.set("type", filterType);
      const r = await apiFetch(`${BASE()}/admin/payment-routing/routes?${params}`, { headers: H() });
      const d = await r.json();
      setRoutes(d.routes ?? []);
      setGateways(d.gateways ?? []);
      setOperators(d.operators ?? []);
    } finally { setLoading(false); }
  }, [filterCountry, filterOp, filterType]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const isEdit = modal !== "create";
    const body = {
      countryCode: form.countryCode, operatorSlug: form.operatorSlug,
      transactionType: form.transactionType || "deposit",
      primaryGatewayId: form.primaryGatewayId || null,
      secondaryGatewayId: form.secondaryGatewayId || null,
      tertiaryGatewayId: form.tertiaryGatewayId || null,
      active: form.active ?? true,
      maintenanceMode: form.maintenanceMode ?? false,
      maintenanceMessage: form.maintenanceMessage || null,
      notes: form.notes || null,
    };
    const url = isEdit ? `${BASE()}/admin/payment-routing/routes/${(modal as PayRoute).id}` : `${BASE()}/admin/payment-routing/routes`;
    await apiFetch(url, { method: isEdit ? "PUT" : "POST", headers: H(), body: JSON.stringify(body) });
    setModal(null);
    void load();
  };

  const del = async (id: string) => {
    if (!confirm("Supprimer cette route ?")) return;
    await apiFetch(`${BASE()}/admin/payment-routing/routes/${id}`, { method: "DELETE", headers: H() });
    void load();
  };

  const toggleMaintenance = async (route: PayRoute) => {
    await apiFetch(`${BASE()}/admin/payment-routing/routes/${route.id}/maintenance`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ maintenanceMode: !route.maintenanceMode }),
    });
    void load();
  };

  const doSwitch = async (routeId: string, gatewayId: string) => {
    setSwitching(routeId);
    try {
      await apiFetch(`${BASE()}/admin/payment-routing/routes/${routeId}/switch`, {
        method: "POST", headers: H(),
        body: JSON.stringify({ gatewayId }),
      });
      setSwitchModal(null);
      void load();
    } finally { setSwitching(null); }
  };

  const uniqueCountries = [...new Set(routes.map(r => r.countryCode))].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
            <option value="">Tous les pays</option>
            {uniqueCountries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterOp} onChange={e => setFilterOp(e.target.value)} className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
            <option value="">Tous les opérateurs</option>
            {operators.map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
            <option value="">Tous types</option>
            <option value="deposit">Dépôt</option>
            <option value="withdrawal">Retrait</option>
          </select>
          <button onClick={() => { setFilterCountry(""); setFilterOp(""); setFilterType(""); }} className="p-2 text-zinc-500 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>
        <button onClick={() => { setForm({ transactionType: "deposit", active: true, maintenanceMode: false }); setModal("create"); }} className="ml-auto flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-white text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> Nouvelle route
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80">
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Pays</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Opérateur</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Principale</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Backup</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Statut</th>
                  <th className="text-right px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map(r => (
                  <tr key={r.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="font-bold text-white">{r.countryCode}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-zinc-300">{r.operator?.name ?? r.operatorSlug}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-medium">{TYPE_LABELS[r.transactionType] ?? r.transactionType}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.primaryGateway ? (
                        <span className={`text-xs font-semibold ${r.primaryGateway.active ? "text-emerald-400" : "text-zinc-500 line-through"}`}>{r.primaryGateway.name}</span>
                      ) : <span className="text-zinc-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {r.secondaryGateway && <span className="text-xs text-zinc-500">{r.secondaryGateway.name}</span>}
                        {r.tertiaryGateway && <span className="text-xs text-zinc-600">{r.tertiaryGateway.name}</span>}
                        {!r.secondaryGateway && !r.tertiaryGateway && <span className="text-zinc-600 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge active={r.active && !r.maintenanceMode} label={r.maintenanceMode ? "Maintenance" : r.active ? "Actif" : "Inactif"} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSwitchModal(r)} title="Basculer API" className="p-1.5 hover:bg-blue-500/15 rounded-lg text-zinc-500 hover:text-blue-400 transition-colors">
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => toggleMaintenance(r)} title={r.maintenanceMode ? "Désactiver maintenance" : "Mode maintenance"} className="p-1.5 hover:bg-amber-500/15 rounded-lg text-zinc-500 hover:text-amber-400 transition-colors">
                          <Wrench className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setForm({ ...r }); setModal(r); }} className="p-1.5 hover:bg-violet-500/15 rounded-lg text-zinc-500 hover:text-violet-400 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => del(r.id)} className="p-1.5 hover:bg-red-500/15 rounded-lg text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {routes.length === 0 && !loading && (
              <div className="text-center py-12 text-zinc-500">Aucune route configurée</div>
            )}
          </div>
        </Card>
      )}

      {/* Route modal */}
      <AnimatePresence>
        {modal !== null && (
          <Modal title={modal === "create" ? "Nouvelle route de paiement" : "Modifier la route"} onClose={() => setModal(null)}>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Code pays *" value={form.countryCode ?? ""} onChange={e => setForm(p => ({ ...p, countryCode: e.target.value.toUpperCase() }))} placeholder="CI" />
              <Select label="Opérateur *" value={form.operatorSlug ?? ""} onChange={e => setForm(p => ({ ...p, operatorSlug: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {operators.map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}
              </Select>
            </div>
            <Select label="Type de transaction" value={form.transactionType ?? "deposit"} onChange={e => setForm(p => ({ ...p, transactionType: e.target.value }))}>
              <option value="deposit">Dépôt</option>
              <option value="withdrawal">Retrait</option>
            </Select>
            <Select label="Passerelle principale" value={form.primaryGatewayId ?? ""} onChange={e => setForm(p => ({ ...p, primaryGatewayId: e.target.value || null }))}>
              <option value="">— Aucune —</option>
              {gateways.map(g => <option key={g.id} value={g.id}>{g.name}{!g.active ? " (inactif)" : ""}</option>)}
            </Select>
            <Select label="Passerelle secondaire (backup)" value={form.secondaryGatewayId ?? ""} onChange={e => setForm(p => ({ ...p, secondaryGatewayId: e.target.value || null }))}>
              <option value="">— Aucune —</option>
              {gateways.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <Select label="Passerelle de secours (tertiary)" value={form.tertiaryGatewayId ?? ""} onChange={e => setForm(p => ({ ...p, tertiaryGatewayId: e.target.value || null }))}>
              <option value="">— Aucune —</option>
              {gateways.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">Message de maintenance</label>
              <input value={form.maintenanceMessage ?? ""} onChange={e => setForm(p => ({ ...p, maintenanceMessage: e.target.value }))} className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none" placeholder="Service temporairement indisponible…" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active ?? true} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="accent-violet-500" />
                <span className="text-sm text-zinc-300">Route active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.maintenanceMode ?? false} onChange={e => setForm(p => ({ ...p, maintenanceMode: e.target.checked }))} className="accent-amber-500" />
                <span className="text-sm text-zinc-300">Maintenance</span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Annuler</button>
              <button onClick={save} className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">Enregistrer</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Switch modal */}
      <AnimatePresence>
        {switchModal !== null && (
          <Modal title={`Basculer — ${switchModal.countryCode} / ${switchModal.operator?.name ?? switchModal.operatorSlug}`} onClose={() => setSwitchModal(null)}>
            <p className="text-sm text-zinc-400">Choisir la nouvelle passerelle principale pour cette route :</p>
            <div className="space-y-2">
              {gateways.filter(g => g.active).map(g => (
                <button
                  key={g.id}
                  disabled={switching === switchModal.id}
                  onClick={() => doSwitch(switchModal.id, g.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    g.id === switchModal.primaryGatewayId
                      ? "bg-violet-600/20 border-violet-500/50 text-white"
                      : "bg-zinc-800/40 border-zinc-700/60 text-zinc-300 hover:border-violet-500/30 hover:bg-zinc-800/80"
                  }`}
                >
                  <Zap className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold text-sm">{g.name}</span>
                  {g.id === switchModal.primaryGatewayId && <span className="ml-auto text-[10px] text-violet-400 font-bold">ACTUELLE</span>}
                  {switching === switchModal.id && <Loader2 className="ml-auto w-3.5 h-3.5 animate-spin" />}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-600">Le changement est instantané et journalisé.</p>
          </Modal>
        )}
      </AnimatePresence>
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
