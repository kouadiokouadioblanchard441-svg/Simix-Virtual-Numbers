import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminLayout } from "@/components/admin-layout";
import { adminToken } from "@/lib/admin-token";
import { LogoField } from "@/components/image-upload-button";
import {
  Server, Cpu, FileText, Plus, Pencil, Trash2,
  CheckCircle, XCircle, Clock, Wifi, AlertTriangle,
  Search, Shield, Wrench, Loader2,
  RefreshCw, Zap, ToggleLeft, ToggleRight,
  ChevronDown, ArrowRight, Globe, Settings,
  Activity, TrendingUp, Check,
} from "lucide-react";

const BASE = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/api";
const H = () => ({ Authorization: `Bearer ${adminToken.get() ?? ""}`, "Content-Type": "application/json" });

async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    adminToken.clear();
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    window.location.href = `${base}/admin/secure-login`;
  }
  return res;
}

/* ─── Types ────────────────────────────────────────────── */
interface Gateway {
  id: string; name: string; slug: string; logoUrl: string | null;
  apiUrl: string | null; apiKey: string | null; apiSecret: string | null;
  webhookSecret: string | null; type: string; supportedCountries: string[];
  supportedOperators: string[]; active: boolean; testMode: boolean; notes: string | null;
  createdAt: string;
}
interface GwBasic { id: string; name: string; slug: string; active: boolean; logoUrl: string | null; testMode: boolean; }
interface Operator {
  id: string; name: string; slug: string; logoUrl: string | null;
  color: string; countryCodes: string[]; active: boolean; sortOrder: number;
}
interface RouteBasic {
  id: string; countryCode: string; operatorSlug: string; transactionType: string;
  primaryGatewayId: string | null; secondaryGatewayId: string | null;
  tertiaryGatewayId: string | null; active: boolean; maintenanceMode: boolean;
  maintenanceMessage: string | null;
}
interface CountryEntry { code: string; name: string; flag: string; operatorSlugs: string[]; }
interface RouteLog {
  id: string; eventType: string; status: string; responseTimeMs: number | null;
  errorMessage: string | null; adminId: string | null; createdAt: string;
  metadata: Record<string, unknown> | null; gatewayId: string | null;
}

/* ─── Toast ─────────────────────────────────────────────── */
interface ToastMsg { id: number; type: "success" | "error"; text: string; }
let toastCounter = 0;

function ToastContainer({ toasts, onRemove }: { toasts: ToastMsg[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium pointer-events-auto cursor-pointer ${
              t.type === "success"
                ? "bg-emerald-950 border-emerald-500/30 text-emerald-300"
                : "bg-red-950 border-red-500/30 text-red-300"
            }`}
            onClick={() => onRemove(t.id)}
          >
            {t.type === "success" ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
  const add = useCallback((type: ToastMsg["type"], text: string) => {
    const id = ++toastCounter;
    setToasts(p => [...p, { id, type, text }]);
    setTimeout(() => remove(id), 3500);
  }, [remove]);
  return { toasts, add, remove };
}

/* ─── Shared UI components ───────────────────────────────── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-zinc-900/60 border border-zinc-800/80 rounded-2xl ${className}`}>{children}</div>;
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1 font-medium">{label}</label>
      <input {...props} className={`w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60 ${props.className ?? ""}`} />
    </div>
  );
}

function Sel({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1 font-medium">{label}</label>
      <select {...props} className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60">{children}</select>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <h3 className="text-white font-bold text-sm">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  );
}

/* ─── Gateway color helper ───────────────────────────────── */
function gwColor(slug: string) {
  const map: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    pawapay: { bg: "bg-violet-600", border: "border-violet-500", text: "text-white", dot: "bg-white" },
    clapay:  { bg: "bg-blue-600",   border: "border-blue-500",   text: "text-white", dot: "bg-white" },
  };
  return map[slug] ?? { bg: "bg-emerald-600", border: "border-emerald-500", text: "text-white", dot: "bg-white" };
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 1 — ROUTING MATRIX (main view)
   ═══════════════════════════════════════════════════════════════ */
function RoutingSection({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [countries, setCountries] = useState<CountryEntry[]>([]);
  const [operatorMap, setOperatorMap] = useState<Record<string, Operator>>({});
  const [gateways, setGateways] = useState<GwBasic[]>([]);
  const [routeMap, setRouteMap] = useState<Record<string, RouteBasic>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedOk, setSavedOk] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [filterCountry, setFilterCountry] = useState<string | null>(null);

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
      ctrs.slice(0, 6).forEach(c => { exp[c.code] = true; });
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
        const gwName = gateways.find(g => g.id === primaryGatewayId)?.name ?? "Aucun";
        toast.add("success", primaryGatewayId ? `${operatorSlug.toUpperCase()} → ${gwName} activé` : `${operatorSlug.toUpperCase()} désactivé`);
        setTimeout(() => setSavedOk(p => { const n = { ...p }; delete n[rowKey]; return n; }), 2500);
      }
    } catch {
      toast.add("error", "Erreur lors de la sauvegarde");
      void load();
    } finally {
      setSaving(p => { const n = { ...p }; delete n[rowKey]; return n; });
    }
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
    toast.add("success", newMode ? "Mode maintenance activé" : "Mode maintenance désactivé");
  };

  const activeGateways = gateways.filter(g => g.active);
  const totalRoutes = Object.keys(routeMap).length;
  const configuredRoutes = Object.values(routeMap).filter(r => r.primaryGatewayId != null).length;

  const visibleCountries = (filterCountry ? countries.filter(c => c.code === filterCountry) : countries)
    .filter(c => search === "" || c.code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        <p className="text-zinc-500 text-sm">Chargement de la matrice de routage…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status bar — gateway pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4.5 h-4.5 text-violet-400" />
          </div>
          <div>
            <p className="text-zinc-400 text-[11px] font-medium">Fournisseurs actifs</p>
            <p className="text-white text-lg font-bold leading-tight">{activeGateways.length}<span className="text-zinc-600 text-sm font-normal">/{gateways.length}</span></p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4.5 h-4.5 text-emerald-400" />
          </div>
          <div>
            <p className="text-zinc-400 text-[11px] font-medium">Routes configurées</p>
            <p className="text-white text-lg font-bold leading-tight">{configuredRoutes}<span className="text-zinc-600 text-sm font-normal">/{totalRoutes || "—"}</span></p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <Globe className="w-4.5 h-4.5 text-blue-400" />
          </div>
          <div>
            <p className="text-zinc-400 text-[11px] font-medium">Pays couverts</p>
            <p className="text-white text-lg font-bold leading-tight">{countries.length}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <Wrench className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div>
            <p className="text-zinc-400 text-[11px] font-medium">En maintenance</p>
            <p className="text-white text-lg font-bold leading-tight">{Object.values(routeMap).filter(r => r.maintenanceMode).length}</p>
          </div>
        </Card>
      </div>

      {/* Gateway quick status */}
      {activeGateways.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {gateways.map(gw => {
            const col = gwColor(gw.slug);
            return (
              <div key={gw.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${gw.active ? `${col.bg}/10 ${col.border}/30 ${col.text}` : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500"}`}>
                <span className={`w-2 h-2 rounded-full ${gw.active ? col.dot + " opacity-100" : "bg-zinc-600"}`} style={{ backgroundColor: gw.active && gw.slug === "pawapay" ? "#8b5cf6" : gw.active && gw.slug === "clapay" ? "#3b82f6" : undefined }} />
                {gw.name}
                {gw.testMode && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded font-bold">TEST</span>}
                {gw.active ? <Check className="w-3 h-3 opacity-70" /> : <XCircle className="w-3 h-3" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Warning if no active gateways */}
      {activeGateways.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-semibold text-sm">Aucun fournisseur actif</p>
            <p className="text-amber-400/70 text-xs mt-0.5">Activez d'abord PawaPay ou Clapay dans l'onglet "Fournisseurs" pour pouvoir configurer le routage.</p>
          </div>
        </div>
      )}

      {/* Search + controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setFilterCountry(null); }}
            placeholder="Rechercher un pays…"
            className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60"
          />
        </div>
        {filterCountry && (
          <button onClick={() => setFilterCountry(null)} className="text-xs text-violet-400 hover:text-violet-300 underline">
            Voir tous les pays
          </button>
        )}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => { const e: Record<string, boolean> = {}; countries.forEach(c => { e[c.code] = true; }); setExpanded(e); }}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Tout ouvrir
          </button>
          <button
            onClick={() => setExpanded({})}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Tout fermer
          </button>
          <button onClick={load} className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-xl text-zinc-400 hover:text-white transition-colors" title="Rafraîchir">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Country cards */}
      <div className="space-y-3">
        {visibleCountries.map(country => {
          const isOpen = expanded[country.code] ?? false;
          const configuredCount = country.operatorSlugs.filter(s => routeMap[`${country.code}:${s}:deposit`]?.primaryGatewayId != null).length;
          const total = country.operatorSlugs.length;
          const pct = total > 0 ? Math.round((configuredCount / total) * 100) : 0;
          const hasMaintenace = country.operatorSlugs.some(s => routeMap[`${country.code}:${s}:deposit`]?.maintenanceMode);

          return (
            <Card key={country.code} className="overflow-hidden">
              {/* Country header */}
              <button
                onClick={() => setExpanded(p => ({ ...p, [country.code]: !p[country.code] }))}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-zinc-800/30 transition-colors text-left"
              >
                <span className="text-3xl leading-none flex-shrink-0">{country.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-bold">{country.name}</span>
                    <code className="text-[10px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">{country.code}</code>
                    {hasMaintenace && (
                      <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Wrench className="w-2.5 h-2.5" /> Maintenance
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex-1 max-w-[120px] h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-violet-500" : "bg-zinc-700"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      {configuredCount}/{total} configuré{configuredCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Operator rows */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 border-t border-zinc-800/60">
                      {/* Legend */}
                      <div className="flex items-center gap-2 py-3 mb-1">
                        <span className="text-[11px] text-zinc-600 font-semibold uppercase tracking-wider">Opérateur</span>
                        <ArrowRight className="w-3 h-3 text-zinc-700" />
                        <span className="text-[11px] text-zinc-600 font-semibold uppercase tracking-wider">API active</span>
                        <span className="ml-auto text-[10px] text-zinc-700">Cliquer pour changer</span>
                      </div>

                      <div className="space-y-2">
                        {country.operatorSlugs.map(slug => {
                          const rowKey = `${country.code}:${slug}`;
                          const routeKey = `${country.code}:${slug}:deposit`;
                          const route = routeMap[routeKey];
                          const isSaving = saving[rowKey] ?? false;
                          const isSaved = savedOk[rowKey] ?? false;
                          const operator = operatorMap[slug];

                          return (
                            <div key={slug} className={`flex items-center gap-3 p-3 rounded-xl border transition-all flex-wrap ${route?.maintenanceMode ? "bg-amber-500/5 border-amber-500/20" : "bg-zinc-800/30 border-zinc-800/60 hover:border-zinc-700/60"}`}>
                              {/* Operator identity */}
                              <div className="flex items-center gap-2.5 min-w-[140px] flex-shrink-0">
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                                  style={{
                                    backgroundColor: (operator?.color ?? "#6B7280") + "20",
                                    border: `1px solid ${operator?.color ?? "#6B7280"}40`,
                                  }}
                                >
                                  <span style={{ color: operator?.color ?? "#9CA3AF" }}>{slug.slice(0, 2).toUpperCase()}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-white text-xs font-bold truncate">{operator?.name ?? slug}</p>
                                  {route?.maintenanceMode && (
                                    <p className="text-amber-400 text-[10px] flex items-center gap-0.5"><Wrench className="w-2.5 h-2.5" /> Maintenance</p>
                                  )}
                                </div>
                              </div>

                              {/* Gateway buttons */}
                              <div className="flex items-center gap-2 flex-wrap flex-1">
                                {activeGateways.length === 0 ? (
                                  <span className="text-xs text-zinc-600 italic">Aucun fournisseur actif</span>
                                ) : (
                                  activeGateways.map(gw => {
                                    const isActive = route?.primaryGatewayId === gw.id;
                                    const col = gwColor(gw.slug);
                                    return (
                                      <button
                                        key={gw.id}
                                        onClick={() => upsertRoute(country.code, slug, isActive ? null : gw.id)}
                                        disabled={isSaving}
                                        title={isActive ? `Désactiver ${gw.name}` : `Utiliser ${gw.name} pour ${operator?.name ?? slug}`}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                                          isActive
                                            ? `${col.bg} ${col.border} ${col.text} shadow-lg`
                                            : "bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 hover:bg-zinc-800"
                                        } disabled:opacity-60`}
                                      >
                                        {isSaving ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : isSaved && isActive ? (
                                          <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
                                        ) : (
                                          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-white" : "bg-zinc-600"}`} />
                                        )}
                                        {gw.name}
                                        {gw.testMode && <span className="text-[9px] bg-amber-500/25 text-amber-300 px-1 rounded font-bold">TEST</span>}
                                      </button>
                                    );
                                  })
                                )}

                                {/* None/clear button if a gateway is set */}
                                {route?.primaryGatewayId && (
                                  <button
                                    onClick={() => upsertRoute(country.code, slug, null)}
                                    disabled={isSaving}
                                    className="px-3 py-2 rounded-xl text-xs font-semibold border border-zinc-700/40 text-zinc-600 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-colors"
                                    title="Retirer la configuration"
                                  >
                                    Retirer
                                  </button>
                                )}
                              </div>

                              {/* Status + maintenance */}
                              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                                {!route?.primaryGatewayId && (
                                  <span className="text-[10px] text-zinc-600 italic">Non configuré</span>
                                )}
                                {route?.id && (
                                  <button
                                    onClick={() => toggleMaintenance(country.code, slug)}
                                    title={route.maintenanceMode ? "Désactiver la maintenance" : "Activer la maintenance"}
                                    className={`p-1.5 rounded-lg border transition-colors ${
                                      route.maintenanceMode
                                        ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                                        : "bg-zinc-800/60 border-zinc-700/60 text-zinc-600 hover:text-amber-400 hover:border-amber-500/30"
                                    }`}
                                  >
                                    <Wrench className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Fallback configuration */}
                      {activeGateways.length > 1 && country.operatorSlugs.some(s => routeMap[`${country.code}:${s}:deposit`]?.primaryGatewayId) && (
                        <details className="mt-3">
                          <summary className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer flex items-center gap-1.5 select-none">
                            <TrendingUp className="w-3 h-3" />
                            Configurer les APIs de secours (fallback)
                          </summary>
                          <div className="mt-3 space-y-2 pl-2 border-l-2 border-zinc-800">
                            {country.operatorSlugs.filter(s => routeMap[`${country.code}:${s}:deposit`]?.primaryGatewayId).map(slug => {
                              const routeKey = `${country.code}:${slug}:deposit`;
                              const route = routeMap[routeKey];
                              const operator = operatorMap[slug];
                              return (
                                <div key={slug} className="flex items-center gap-3 flex-wrap p-3 bg-zinc-800/30 rounded-xl">
                                  <span className="text-xs text-zinc-300 font-bold w-24 flex-shrink-0">{operator?.name ?? slug}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-500 font-semibold">2ème :</span>
                                    <select
                                      value={route?.secondaryGatewayId ?? ""}
                                      onChange={e => upsertRoute(country.code, slug, route?.primaryGatewayId ?? null, e.target.value || null)}
                                      className="bg-zinc-800 border border-zinc-700/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/60"
                                    >
                                      <option value="">— Aucun —</option>
                                      {gateways.filter(g => g.id !== route?.primaryGatewayId).map(g => (
                                        <option key={g.id} value={g.id}>{g.name}{!g.active ? " ✗" : ""}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-500 font-semibold">3ème :</span>
                                    <select
                                      value={route?.tertiaryGatewayId ?? ""}
                                      onChange={e => upsertRoute(country.code, slug, route?.primaryGatewayId ?? null, route?.secondaryGatewayId, e.target.value || null)}
                                      className="bg-zinc-800 border border-zinc-700/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/60"
                                    >
                                      <option value="">— Aucun —</option>
                                      {gateways.filter(g => g.id !== route?.primaryGatewayId && g.id !== route?.secondaryGatewayId).map(g => (
                                        <option key={g.id} value={g.id}>{g.name}{!g.active ? " ✗" : ""}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}

        {visibleCountries.length === 0 && (
          <div className="text-center py-16 text-zinc-500">
            {search ? `Aucun pays correspondant à "${search}"` : "Aucun opérateur configuré. Ajoutez des opérateurs dans l'onglet Opérateurs."}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 2 — GATEWAYS (fournisseurs)
   ═══════════════════════════════════════════════════════════════ */
function GatewaysSection({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "create" | Gateway>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: string; message: string; responseTimeMs?: number }>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Gateway>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${BASE()}/admin/payment-routing/gateways`, { headers: H() });
      const d = await r.json();
      setGateways(d.gateways ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
    const url = isEdit
      ? `${BASE()}/admin/payment-routing/gateways/${(modal as Gateway).id}`
      : `${BASE()}/admin/payment-routing/gateways`;
    const r = await apiFetch(url, { method: isEdit ? "PUT" : "POST", headers: H(), body: JSON.stringify(body) });
    if (r.ok) {
      toast.add("success", isEdit ? "Fournisseur mis à jour" : "Fournisseur créé");
      setModal(null);
      void load();
    } else {
      toast.add("error", "Erreur lors de la sauvegarde");
    }
  };

  const del = async (id: string) => {
    if (!confirm("Supprimer ce fournisseur ? Cette action est irréversible.")) return;
    await apiFetch(`${BASE()}/admin/payment-routing/gateways/${id}`, { method: "DELETE", headers: H() });
    toast.add("success", "Fournisseur supprimé");
    void load();
  };

  const testGateway = async (id: string) => {
    setTesting(id);
    try {
      const r = await apiFetch(`${BASE()}/admin/payment-routing/gateways/${id}/test`, { method: "POST", headers: H() });
      const d = await r.json();
      setTestResults(p => ({ ...p, [id]: d }));
      toast.add(d.status === "connected" ? "success" : "error", d.message);
    } finally { setTesting(null); }
  };

  const toggleActive = async (gw: Gateway) => {
    await apiFetch(`${BASE()}/admin/payment-routing/gateways/${gw.id}`, {
      method: "PUT", headers: H(),
      body: JSON.stringify({ active: !gw.active }),
    });
    toast.add("success", gw.active ? "Fournisseur désactivé" : "Fournisseur activé");
    void load();
  };

  const STATUS_COLOR: Record<string, string> = {
    connected: "text-emerald-400", error: "text-red-400",
    timeout: "text-amber-400", no_url: "text-zinc-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-zinc-400 text-sm">Gérez vos APIs de paiement (PawaPay, Clapay, etc.)</p>
        <button
          onClick={() => { setForm({ type: "both", active: true, testMode: false }); setModal("create"); }}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Ajouter un fournisseur
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : (
        <div className="grid gap-3">
          {gateways.map(gw => {
            const test = testResults[gw.id];
            const col = gwColor(gw.slug);
            return (
              <Card key={gw.id} className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${gw.active ? `${col.bg}/15 border ${col.border}/30` : "bg-zinc-800 border border-zinc-700/40"}`}>
                    <Server className={`w-5 h-5 ${gw.active ? (gw.slug === "pawapay" ? "text-violet-400" : "text-blue-400") : "text-zinc-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap mb-1">
                      <span className="text-white font-bold">{gw.name}</span>
                      <code className="text-[10px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">{gw.slug}</code>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${gw.active ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-red-500/15 text-red-400 border border-red-500/25"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${gw.active ? "bg-emerald-400" : "bg-red-400"}`} />
                        {gw.active ? "Actif" : "Inactif"}
                      </span>
                      {gw.testMode && <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full font-bold">Mode Test</span>}
                    </div>
                    {gw.apiUrl && <p className="text-xs text-zinc-500 truncate">{gw.apiUrl}</p>}
                    {gw.notes && <p className="text-xs text-zinc-400 mt-1">{gw.notes}</p>}
                    {test && (
                      <div className={`text-xs mt-2 flex items-center gap-1.5 ${STATUS_COLOR[test.status] ?? "text-zinc-400"}`}>
                        {test.status === "connected" ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {test.message}
                        {test.responseTimeMs && <span className="text-zinc-500 ml-1">· {test.responseTimeMs}ms</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => testGateway(gw.id)}
                      disabled={testing === gw.id}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-blue-500/15 border border-zinc-700/60 hover:border-blue-500/40 text-zinc-400 hover:text-blue-400 rounded-lg text-xs transition-colors flex items-center gap-1.5"
                    >
                      {testing === gw.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                      Tester
                    </button>
                    <button
                      onClick={() => toggleActive(gw)}
                      title={gw.active ? "Désactiver" : "Activer"}
                      className="p-1.5 hover:bg-zinc-700/50 rounded-lg transition-colors"
                    >
                      {gw.active
                        ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                        : <ToggleLeft className="w-5 h-5 text-zinc-600" />}
                    </button>
                    <button onClick={() => { setForm({ ...gw }); setModal(gw); }} className="p-1.5 hover:bg-violet-500/15 rounded-lg text-zinc-500 hover:text-violet-400 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => del(gw.id)} className="p-1.5 hover:bg-red-500/15 rounded-lg text-zinc-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
          {gateways.length === 0 && <div className="text-center py-12 text-zinc-500">Aucun fournisseur configuré</div>}
        </div>
      )}

      <AnimatePresence>
        {modal !== null && (
          <Modal
            title={modal === "create" ? "Nouveau fournisseur API" : `Modifier — ${(modal as Gateway).name}`}
            onClose={() => setModal(null)}
          >
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nom *" value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="PawaPay" />
              <Input label="Slug *" value={form.slug ?? ""} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} placeholder="pawapay" />
            </div>
            <Input label="URL API" value={form.apiUrl ?? ""} onChange={e => setForm(p => ({ ...p, apiUrl: e.target.value }))} placeholder="https://api.pawapay.io" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Clé API" type="password" value={form.apiKey ?? ""} onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="sk_live_…" />
              <Input label="Secret API" type="password" value={form.apiSecret ?? ""} onChange={e => setForm(p => ({ ...p, apiSecret: e.target.value }))} placeholder="secret_…" />
            </div>
            <Input label="Webhook Secret" type="password" value={form.webhookSecret ?? ""} onChange={e => setForm(p => ({ ...p, webhookSecret: e.target.value }))} placeholder="whsec_…" />
            <Sel label="Type de transaction" value={form.type ?? "both"} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="deposit">Dépôt uniquement</option>
              <option value="withdrawal">Retrait uniquement</option>
              <option value="both">Dépôt et retrait</option>
            </Sel>
            <LogoField
              label="Logo"
              value={form.logoUrl ?? ""}
              onChange={v => setForm(p => ({ ...p, logoUrl: v }))}
              authHeader={{ Authorization: `Bearer ${adminToken.get() ?? ""}` }}
              placeholder="https://… ou uploader →"
            />
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">Notes internes</label>
              <textarea
                value={form.notes ?? ""}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60 resize-none"
              />
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
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Annuler</button>
              <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">Enregistrer</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 3 — OPERATORS
   ═══════════════════════════════════════════════════════════════ */
function OperatorsSection({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "create" | Operator>(null);
  const [form, setForm] = useState<Partial<Operator>>({});
  const [search, setSearch] = useState("");

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
    const url = isEdit
      ? `${BASE()}/admin/payment-routing/operators/${(modal as Operator).id}`
      : `${BASE()}/admin/payment-routing/operators`;
    const r = await apiFetch(url, { method: isEdit ? "PUT" : "POST", headers: H(), body: JSON.stringify(body) });
    if (r.ok) {
      toast.add("success", isEdit ? "Opérateur mis à jour" : "Opérateur créé");
      setModal(null);
      void load();
    } else {
      toast.add("error", "Erreur lors de la sauvegarde");
    }
  };

  const del = async (id: string) => {
    if (!confirm("Supprimer cet opérateur ?")) return;
    await apiFetch(`${BASE()}/admin/payment-routing/operators/${id}`, { method: "DELETE", headers: H() });
    toast.add("success", "Opérateur supprimé");
    void load();
  };

  const toggleActive = async (op: Operator) => {
    await apiFetch(`${BASE()}/admin/payment-routing/operators/${op.id}`, {
      method: "PUT", headers: H(),
      body: JSON.stringify({ active: !op.active }),
    });
    toast.add("success", op.active ? "Opérateur désactivé" : "Opérateur activé");
    void load();
  };

  const filtered = operators.filter(op =>
    search === "" || op.name.toLowerCase().includes(search.toLowerCase()) || op.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un opérateur…"
            className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60"
          />
        </div>
        <button
          onClick={() => { setForm({ color: "#6B7280", active: true, sortOrder: 100, countryCodes: [] }); setModal("create"); }}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-white text-sm font-semibold transition-colors ml-auto"
        >
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(op => (
            <Card key={op.id} className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: op.color + "25", border: `1px solid ${op.color}40` }}
                >
                  <span className="text-sm font-bold" style={{ color: op.color }}>{op.name.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate">{op.name}</p>
                  <code className="text-[10px] text-zinc-500">{op.slug}</code>
                </div>
                <button onClick={() => toggleActive(op)} title={op.active ? "Désactiver" : "Activer"}>
                  {op.active
                    ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                    : <ToggleLeft className="w-5 h-5 text-zinc-600" />}
                </button>
              </div>
              {(op.countryCodes as string[]).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {(op.countryCodes as string[]).slice(0, 8).map((cc: string) => (
                    <span key={cc} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{cc}</span>
                  ))}
                  {(op.countryCodes as string[]).length > 8 && (
                    <span className="text-[10px] text-zinc-600">+{(op.countryCodes as string[]).length - 8}</span>
                  )}
                </div>
              )}
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setForm({ ...op }); setModal(op); }}
                  className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-1"
                >
                  <Pencil className="w-3 h-3" /> Modifier
                </button>
                <button onClick={() => del(op.id)} className="p-1.5 hover:bg-red-500/15 rounded-lg text-zinc-600 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && <div className="col-span-3 text-center py-12 text-zinc-500">Aucun opérateur trouvé</div>}
        </div>
      )}

      <AnimatePresence>
        {modal !== null && (
          <Modal
            title={modal === "create" ? "Nouvel opérateur" : `Modifier — ${(modal as Operator).name}`}
            onClose={() => setModal(null)}
          >
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
              <Input label="Ordre d'affichage" type="number" value={form.sortOrder ?? 100} onChange={e => setForm(p => ({ ...p, sortOrder: Number(e.target.value) }))} />
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
              <label className="block text-xs text-zinc-400 mb-1 font-medium">Pays disponibles (codes ISO séparés par virgule)</label>
              <input
                value={(form.countryCodes as string[] ?? []).join(",")}
                onChange={e => setForm(p => ({ ...p, countryCodes: e.target.value.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) }))}
                className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60"
                placeholder="CI,CM,SN,GH"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active ?? true} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="accent-violet-500" />
              <span className="text-sm text-zinc-300">Opérateur actif</span>
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Annuler</button>
              <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">Enregistrer</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 4 — LOGS
   ═══════════════════════════════════════════════════════════════ */
function LogsSection() {
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
      <div className="flex items-center gap-3 flex-wrap">
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
        <span className="ml-auto text-xs text-zinc-500">{total} événements</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : (
        <Card>
          {logs.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">Aucun journal pour ces filtres</div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/20 transition-colors">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.status === "success" ? "bg-emerald-400" : log.status === "timeout" ? "bg-amber-400" : "bg-red-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold ${EVENT_COLORS[log.eventType] ?? "text-zinc-400"}`}>{log.eventType}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${log.status === "success" ? "bg-emerald-500/15 text-emerald-400" : log.status === "timeout" ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>{log.status}</span>
                      {log.responseTimeMs != null && <span className="text-[10px] text-zinc-600">{log.responseTimeMs}ms</span>}
                    </div>
                    {log.errorMessage && <p className="text-xs text-red-400/70 mt-0.5">{log.errorMessage}</p>}
                  </div>
                  <time className="text-[10px] text-zinc-600 flex-shrink-0">
                    {new Date(log.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
type SectionId = "routing" | "gateways" | "operators" | "logs";

const SECTIONS: { id: SectionId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "routing",   label: "Routage",       icon: Globe,    desc: "Assigner une API à chaque opérateur par pays" },
  { id: "gateways",  label: "Fournisseurs",  icon: Server,   desc: "PawaPay, Clapay et autres APIs" },
  { id: "operators", label: "Opérateurs",    icon: Cpu,      desc: "MTN, Orange, Wave, Moov…" },
  { id: "logs",      label: "Journaux",      icon: FileText, desc: "Historique des changements" },
];

export default function PaymentRoutingPage() {
  const [section, setSection] = useState<SectionId>("routing");
  const toast = useToast();

  return (
    <AdminLayout>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />

      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">Configuration des Paiements</h1>
            <p className="text-zinc-400 text-sm">Choisissez quelle API (PawaPay / Clapay) traite chaque opérateur par pays</p>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 p-1 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl mb-6 flex-wrap">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              section === s.id
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <s.icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Section description */}
      <div className="mb-5">
        {SECTIONS.filter(s => s.id === section).map(s => (
          <p key={s.id} className="text-zinc-500 text-sm flex items-center gap-2">
            <s.icon className="w-4 h-4" />
            {s.desc}
          </p>
        ))}
      </div>

      {/* Section content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {section === "routing"   && <RoutingSection   toast={toast} />}
          {section === "gateways"  && <GatewaysSection  toast={toast} />}
          {section === "operators" && <OperatorsSection toast={toast} />}
          {section === "logs"      && <LogsSection />}
        </motion.div>
      </AnimatePresence>
    </AdminLayout>
  );
}
