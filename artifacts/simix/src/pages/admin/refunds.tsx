import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import {
  RotateCcw, TrendingUp, CheckCircle2, Loader2, RefreshCw,
  Wallet, Users, Zap, AlertTriangle, Play, BarChart2,
  Clock, Ban, Calendar, ArrowUpRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ── Categorise refund reason from description text ── */
function categorise(desc: string | null): { label: string; color: string; bg: string } {
  const d = (desc ?? "").toLowerCase();
  if (d.includes("30 min"))     return { label: "Délai 30 min",   color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" };
  if (d.includes("expiré"))     return { label: "Numéro expiré",  color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20"  };
  if (d.includes("annulé") || d.includes("annule"))
                                 return { label: "Annulé (5sim)",  color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20"   };
  if (d.includes("manuel") || d.includes("admin"))
                                 return { label: "Manuel admin",   color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" };
  return                                 { label: "Autre",          color: "text-zinc-400",   bg: "bg-zinc-800 border-zinc-700"         };
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return "À l'instant";
  const m = Math.floor(s / 60);
  if (m < 60)   return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `Il y a ${h}h`;
  const day = Math.floor(h / 24);
  return `Il y a ${day}j`;
}

/* ── Mini bar chart for daily trend ── */
function SparkBar({ data }: { data: { date: string; count: number; amount: number }[] }) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-16 text-xs text-zinc-600">Aucune donnée</div>
  );
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-px h-16" title="Remboursements par jour (30 derniers jours)">
      {data.map(d => (
        <div
          key={d.date}
          className="flex-1 bg-violet-500/50 hover:bg-violet-400 rounded-sm transition-colors cursor-default"
          style={{ height: `${Math.max(6, (d.count / maxCount) * 100)}%` }}
          title={`${d.date} : ${d.count} remboursement(s) · ${formatFCFA(d.amount)}`}
        />
      ))}
    </div>
  );
}

/* ── Stat card ── */
function StatCard({
  label, value, sub, icon: Icon, accent = "violet",
}: { label: string; value: string; sub?: string; icon: React.ElementType; accent?: string }) {
  const colors: Record<string, { bg: string; icon: string; text: string }> = {
    violet:  { bg: "border-violet-800/40 from-violet-950/30",  icon: "bg-violet-600",  text: "text-violet-400"  },
    emerald: { bg: "border-emerald-800/40 from-emerald-950/30", icon: "bg-emerald-600", text: "text-emerald-400" },
    amber:   { bg: "border-amber-700/40 from-amber-950/30",    icon: "bg-amber-600",   text: "text-amber-400"   },
    blue:    { bg: "border-blue-800/40 from-blue-950/30",      icon: "bg-blue-600",    text: "text-blue-400"    },
  };
  const c = colors[accent] ?? colors.violet;
  return (
    <div className={`bg-gradient-to-br ${c.bg} to-zinc-900 border rounded-2xl p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl ${c.icon} flex items-center justify-center shadow-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className={`text-xs font-medium ${c.text} bg-zinc-900 px-2 py-1 rounded-full`}>{label}</span>
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        {sub && <div className="text-xs text-zinc-400 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function RefundsContent() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-refund-stats"],
    queryFn: adminApi.getRefundStats,
    refetchInterval: 60_000,
  });

  const sweep = useMutation({
    mutationFn: adminApi.triggerRefundSweep,
    onSuccess: (r) => {
      toast({ title: "Sweep terminé", description: r.message });
      qc.invalidateQueries({ queryKey: ["admin-refund-stats"] });
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-zinc-400">Impossible de charger les statistiques.</p>
        <button onClick={() => refetch()} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg">Réessayer</button>
      </div>
    );
  }

  const { overview, byReason, topServices, recent, dailyTrend } = data;

  /* Build reason summary */
  const totalByReason = byReason.reduce((acc, r) => {
    const cat = categorise(r.description).label;
    if (!acc[cat]) acc[cat] = { count: 0, amount: 0 };
    acc[cat].count  += r.count;
    acc[cat].amount += r.amount;
    return acc;
  }, {} as Record<string, { count: number; amount: number }>);
  const reasonEntries = Object.entries(totalByReason).sort((a, b) => b[1].count - a[1].count);
  const maxReasonCount = Math.max(...reasonEntries.map(([, v]) => v.count), 1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            Remboursements automatiques
          </h1>
          <p className="text-zinc-400 text-sm mt-1.5">
            Statistiques des remboursements 5sim — numéros expirés, annulés ou délai dépassé
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl border border-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />Actualiser
          </button>
          <button
            onClick={() => { if (confirm("Déclencher le sweep de remboursement manuellement ?")) sweep.mutate(); }}
            disabled={sweep.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors disabled:opacity-50"
          >
            {sweep.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Lancer sweep
          </button>
        </div>
      </div>

      {/* Stat cards — 4 metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Montant total remboursé"
          value={formatFCFA(overview.totalAmountRefunded)}
          sub={`${overview.totalRefunds} remboursement${overview.totalRefunds !== 1 ? "s" : ""} au total`}
          icon={Wallet}
          accent="violet"
        />
        <StatCard
          label="Taux de succès 5sim"
          value={`${overview.successRate} %`}
          sub={`${overview.purchaseCount} commandes · ${overview.totalRefunds} remboursées`}
          icon={overview.successRate >= 80 ? CheckCircle2 : AlertTriangle}
          accent={overview.successRate >= 80 ? "emerald" : "amber"}
        />
        <StatCard
          label="30 derniers jours"
          value={formatFCFA(overview.last30DaysAmount)}
          sub={`${overview.last30DaysRefunds} remboursement${overview.last30DaysRefunds !== 1 ? "s" : ""}`}
          icon={Calendar}
          accent="blue"
        />
        <StatCard
          label="Montant moyen"
          value={formatFCFA(overview.avgRefundAmount)}
          sub="par remboursement"
          icon={BarChart2}
          accent="amber"
        />
      </div>

      {/* Trend + Reasons (2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily sparkline */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-semibold">Tendance journalière</h2>
              <p className="text-xs text-zinc-400 mt-0.5">30 derniers jours</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <div className="w-3 h-3 bg-violet-500/60 rounded-sm" />
              Remboursements / jour
            </div>
          </div>
          <SparkBar data={dailyTrend} />
          {dailyTrend.length > 0 && (
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>{dailyTrend[0]?.date?.slice(5)}</span>
              <span>{dailyTrend[dailyTrend.length - 1]?.date?.slice(5)}</span>
            </div>
          )}
        </div>

        {/* Reason breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="mb-4">
            <h2 className="text-white font-semibold">Répartition par motif</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Toutes périodes confondues</p>
          </div>
          {reasonEntries.length === 0 ? (
            <div className="text-zinc-500 text-sm py-6 text-center">Aucun remboursement enregistré</div>
          ) : (
            <div className="space-y-3">
              {reasonEntries.map(([label, { count, amount }]) => {
                const cat = categorise(byReason.find(r => categorise(r.description).label === label)?.description ?? null);
                return (
                  <div key={label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className={`font-medium ${cat.color}`}>{label}</span>
                      <span className="text-zinc-300 font-mono text-xs">{count} · {formatFCFA(amount)}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(count / maxReasonCount) * 100}%`,
                          background: cat.color.includes("orange") ? "#f97316" :
                                      cat.color.includes("amber")  ? "#f59e0b" :
                                      cat.color.includes("blue")   ? "#3b82f6" :
                                      cat.color.includes("violet") ? "#8b5cf6" : "#71717a",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top services + Recent refunds (2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top services */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Zap className="w-4 h-4 text-amber-400" />
            <h2 className="text-white font-semibold">Services les plus remboursés</h2>
          </div>
          {topServices.length === 0 ? (
            <div className="text-zinc-500 text-sm py-6 text-center">Aucune donnée disponible</div>
          ) : (
            <div className="space-y-2">
              {topServices.map((s, i) => (
                <div key={s.serviceSlug} className="flex items-center gap-3 py-2 border-b border-zinc-800/60 last:border-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? "bg-amber-500/20 text-amber-400" :
                    i === 1 ? "bg-zinc-700 text-zinc-300" :
                    i === 2 ? "bg-orange-900/30 text-orange-400" : "bg-zinc-800 text-zinc-500"
                  }`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{s.service}</div>
                    <div className="text-zinc-500 text-xs">moy. {formatFCFA(s.avgAmount)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-white text-sm font-semibold">{s.count}×</div>
                    <div className="text-zinc-400 text-xs">{formatFCFA(s.totalAmount)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent refunds */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Clock className="w-4 h-4 text-violet-400" />
            <h2 className="text-white font-semibold">Derniers remboursements</h2>
          </div>
          {recent.length === 0 ? (
            <div className="text-zinc-500 text-sm py-6 text-center">Aucun remboursement enregistré</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {recent.map((r) => {
                const cat = categorise(r.description);
                return (
                  <div key={r.id} className="flex items-start gap-3 py-2.5 border-b border-zinc-800/60 last:border-0">
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${cat.bg}`}>
                      <RotateCcw className={`w-3.5 h-3.5 ${cat.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium truncate">{r.userName ?? "Inconnu"}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cat.bg} ${cat.color}`}>{cat.label}</span>
                      </div>
                      <div className="text-zinc-500 text-xs mt-0.5 truncate">{r.userPhone ?? r.userId.slice(0, 8) + "…"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-emerald-400 text-sm font-semibold">+{formatFCFA(r.amount)}</div>
                      <div className="text-zinc-600 text-[10px]">{relativeDate(r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt))}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Success rate indicator */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Taux de succès des commandes 5sim
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Pourcentage de commandes ne nécessitant pas de remboursement · {overview.purchaseCount} achat{overview.purchaseCount !== 1 ? "s" : ""} total
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-4xl font-bold text-white">
              <span className={overview.successRate >= 80 ? "text-emerald-400" : overview.successRate >= 60 ? "text-amber-400" : "text-red-400"}>
                {overview.successRate}%
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              overview.successRate >= 80 ? "bg-emerald-500" :
              overview.successRate >= 60 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${overview.successRate}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-zinc-500 mt-1">
          <span>0 %</span>
          <span className={overview.successRate >= 80 ? "text-emerald-400 font-medium" : overview.successRate >= 60 ? "text-amber-400 font-medium" : "text-red-400 font-medium"}>
            {overview.successRate >= 80 ? "Excellent" : overview.successRate >= 60 ? "Moyen" : "À améliorer"}
          </span>
          <span>100 %</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminRefunds() {
  return (
    <AdminGuard>
      <AdminLayout>
        <RefundsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
