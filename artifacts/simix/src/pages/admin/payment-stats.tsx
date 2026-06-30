import { useState, useEffect, useCallback } from "react";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { adminToken } from "@/lib/admin-token";
import { formatFCFA } from "@/lib/format";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Clock, Zap, TrendingUp, AlertCircle } from "lucide-react";

const BASE = () => `${window.location.origin}/api`;
const H = () => ({ Authorization: `Bearer ${adminToken.get() ?? ""}`, "Content-Type": "application/json" });

/* ── Types ──────────────────────────────────────────────── */
interface DayEntry {
  day: string;
  success: number; error: number; timeout: number;
  avgLatencyMs: number; totalXof: number;
}
interface GatewayStats {
  today: { success: number; error: number; timeout: number; avgLatencyMs: number; totalXof: number };
  pending: number;
  days: DayEntry[];
}
interface GatewayStatsResponse {
  gateways: { clapay: GatewayStats; pawapay: GatewayStats };
  generatedAt: string;
}

/* ── Helpers ─────────────────────────────────────────────── */
function successRate(g: GatewayStats["today"]): number {
  const total = g.success + g.error + g.timeout;
  return total > 0 ? Math.round((g.success / total) * 100) : 0;
}
function totalAttempts(g: GatewayStats["today"]): number {
  return g.success + g.error + g.timeout;
}

/* ── Sub-components ──────────────────────────────────────── */
function SuccessBar({ rate }: { rate: number }) {
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-1.5 rounded-full transition-all duration-700 ${rate >= 80 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
        style={{ width: `${rate}%` }}
      />
    </div>
  );
}

function MiniTrendChart({ days, color }: { days: DayEntry[]; color: string }) {
  const maxSuccess = Math.max(...days.map(d => d.success), 1);
  const maxErr = Math.max(...days.map(d => d.error + d.timeout), 1);
  const maxTotal = Math.max(maxSuccess + maxErr, 1);

  return (
    <div className="mt-4">
      <p className="text-[10px] text-zinc-500 mb-2 font-medium uppercase tracking-wide">7 derniers jours</p>
      <div className="flex items-end gap-1 h-16">
        {days.map((d, i) => {
          const total = d.success + d.error + d.timeout;
          const succPct = maxTotal > 0 ? (d.success / maxTotal) * 100 : 0;
          const errPct  = maxTotal > 0 ? ((d.error + d.timeout) / maxTotal) * 100 : 0;
          const label = new Date(d.day + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-white text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {label} · {total} tentative{total !== 1 ? "s" : ""} · {formatFCFA(d.totalXof)}
              </div>
              <div className="w-full flex flex-col-reverse" style={{ height: "52px" }}>
                {errPct > 0 && (
                  <div className="w-full bg-red-500/50 rounded-t-none rounded-b-sm" style={{ height: `${Math.max(errPct, 4)}%` }} />
                )}
                {succPct > 0 && (
                  <div className={`w-full rounded-t-sm ${color}`} style={{ height: `${Math.max(succPct, 4)}%` }} />
                )}
                {total === 0 && <div className="w-full bg-zinc-700/30 rounded-sm" style={{ height: "4px" }} />}
              </div>
              <span className="text-[9px] text-zinc-600 font-mono mt-0.5">{label.split("/")[0]}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <span className={`flex items-center gap-1 text-[10px] text-zinc-400`}><span className={`w-2 h-2 rounded-sm ${color} inline-block`} />succès</span>
        <span className="flex items-center gap-1 text-[10px] text-zinc-400"><span className="w-2 h-2 rounded-sm bg-red-500/50 inline-block" />erreurs</span>
      </div>
    </div>
  );
}

function GatewayCard({
  name, slug, stats, color, bgColor, borderColor,
}: {
  name: string; slug: string;
  stats: GatewayStats;
  color: string; bgColor: string; borderColor: string;
}) {
  const rate = successRate(stats.today);
  const total = totalAttempts(stats.today);

  return (
    <div className={`rounded-2xl border p-5 ${bgColor} ${borderColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${color.replace("text-", "bg-")}`} />
          <h3 className="font-bold text-white text-base">{name}</h3>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
          rate >= 80 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          : rate >= 50 ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
          : "bg-red-500/10 text-red-400 border-red-500/20"
        }`}>
          {rate}% succès
        </span>
      </div>

      {/* Today's KPIs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">tentatives aujourd'hui</div>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <div className="text-2xl font-bold text-emerald-400">{stats.today.success}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">initialisations réussies</div>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <div className="flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-xl font-bold text-red-400">{stats.today.error + stats.today.timeout}</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">erreurs</div>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            <span className="text-xl font-bold text-white">
              {stats.today.avgLatencyMs > 0 ? `${stats.today.avgLatencyMs}ms` : "—"}
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">latence moy.</div>
        </div>
      </div>

      {/* Total XOF today */}
      {stats.today.totalXof > 0 && (
        <div className="bg-zinc-900/60 rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">Montant total initié aujourd'hui</span>
          <span className="text-sm font-bold text-white">{formatFCFA(stats.today.totalXof)}</span>
        </div>
      )}

      {/* Success rate bar */}
      <div className="mb-1 flex justify-between items-center">
        <span className="text-[10px] text-zinc-500">Taux de réussite</span>
        <span className={`text-[10px] font-bold ${rate >= 80 ? "text-emerald-400" : rate >= 50 ? "text-amber-400" : "text-red-400"}`}>{rate}%</span>
      </div>
      <SuccessBar rate={rate} />

      {/* Pending */}
      {stats.pending > 0 && (
        <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-[11px] text-amber-400 font-medium">{stats.pending} dépôt{stats.pending !== 1 ? "s" : ""} en attente</span>
        </div>
      )}

      {/* 7-day chart */}
      <MiniTrendChart
        days={stats.days}
        color={slug === "clapay" ? "bg-violet-500" : "bg-blue-500"}
      />
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────── */
function PaymentStatsContent() {
  const [data, setData] = useState<GatewayStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${BASE()}/admin/payment-routing/gateway-stats`, { headers: H() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: GatewayStatsResponse = await r.json();
      setData(d);
      setLastRefresh(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* Auto-refresh every 30s */
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const clapay  = data?.gateways.clapay;
  const pawapay = data?.gateways.pawapay;

  const totalToday = (clapay ? totalAttempts(clapay.today) : 0) + (pawapay ? totalAttempts(pawapay.today) : 0);
  const totalSuccess = (clapay?.today.success ?? 0) + (pawapay?.today.success ?? 0);
  const totalPending = (clapay?.pending ?? 0) + (pawapay?.pending ?? 0);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-violet-400" />
            Tableau de bord Paiements
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Clapay & PawaPay · Données en temps réel
            {lastRefresh && ` · Mis à jour ${lastRefresh.toLocaleTimeString("fr-FR")}`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-violet-400" : ""}`} />
          Rafraîchir
        </button>
      </div>

      {/* Global summary bar */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{totalToday}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">tentatives today</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{totalSuccess}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">initialisations réussies</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${totalPending > 0 ? "text-amber-400" : "text-zinc-400"}`}>{totalPending}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">dépôts en attente</div>
          </div>
        </div>
      )}

      {/* Loading / error */}
      {loading && !data && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Gateway cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GatewayCard
            name="Clapay"
            slug="clapay"
            stats={data.gateways.clapay}
            color="text-violet-400"
            bgColor="bg-violet-950/20"
            borderColor="border-violet-700/30"
          />
          <GatewayCard
            name="PawaPay"
            slug="pawapay"
            stats={data.gateways.pawapay}
            color="text-blue-400"
            bgColor="bg-blue-950/20"
            borderColor="border-blue-700/30"
          />
        </div>
      )}

      <p className="text-center text-[10px] text-zinc-600 animate-pulse">↻ auto-refresh toutes les 30 secondes</p>
    </div>
  );
}

export default function PaymentStatsPage() {
  return (
    <AdminGuard>
      <AdminLayout>
        <PaymentStatsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
