import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { adminApi } from "@/lib/admin-api";
import type { AdminFxProfit, AdminFxSummary } from "@/lib/admin-api";
import { TrendingUp, DollarSign, Globe, BarChart3, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function formatXof(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}

function formatDate(s: string) {
  return new Date(s).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function SummaryCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-zinc-500 font-medium">{label}</p>
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdminFxProfits() {
  const { data: summary, isLoading: loadingSum } = useQuery<AdminFxSummary>({
    queryKey: ["admin-fx-summary"],
    queryFn: () => adminApi.getFxSummary(),
  });

  const { data: result, isLoading: loadingList, refetch } = useQuery<{ profits: AdminFxProfit[]; total: number }>({
    queryKey: ["admin-fx-profits"],
    queryFn: () => adminApi.getFxProfits({ limit: 100, offset: 0 }),
  });

  const profits = result?.profits ?? [];

  return (
    <AdminLayout title="Profits FX">
      <div className="space-y-6">

        {/* Global summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Profit FX total"
            value={loadingSum ? "…" : formatXof(summary?.global.totalProfit ?? 0)}
            sub="toutes devises"
            icon={TrendingUp}
            color="bg-emerald-500/10 text-emerald-400"
          />
          <SummaryCard
            label="Volume total (XOF)"
            value={loadingSum ? "…" : formatXof(summary?.global.totalVolume ?? 0)}
            sub="dépôts convertis"
            icon={DollarSign}
            color="bg-violet-500/10 text-violet-400"
          />
          <SummaryCard
            label="Transactions FX"
            value={loadingSum ? "…" : String(summary?.global.transactionCount ?? 0)}
            sub="dépôts avec conversion"
            icon={BarChart3}
            color="bg-blue-500/10 text-blue-400"
          />
          <SummaryCard
            label="Devises actives"
            value={loadingSum ? "…" : String(summary?.byCurrency.length ?? 0)}
            sub="paires configurées"
            icon={Globe}
            color="bg-amber-500/10 text-amber-400"
          />
        </div>

        {/* By currency breakdown */}
        {!loadingSum && (summary?.byCurrency ?? []).length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-800">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-violet-400" />
                Profit par devise
              </h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {(summary?.byCurrency ?? []).map(row => {
                const margin = row.totalVolume > 0 ? (row.totalProfit / row.totalVolume * 100).toFixed(1) : "0.0";
                return (
                  <div key={row.currency} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-violet-400">{row.currency}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{row.currency}</p>
                      <p className="text-xs text-zinc-500">{row.transactionCount} transactions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">{formatXof(row.totalProfit)}</p>
                      <p className="text-xs text-zinc-500">marge {margin}%</p>
                    </div>
                    <div className="text-right hidden lg:block">
                      <p className="text-sm font-semibold text-white">{formatXof(row.totalVolume)}</p>
                      <p className="text-xs text-zinc-500">volume</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transactions log */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-400" />
              Journal des conversions FX
              {result && <span className="text-xs text-zinc-500 font-normal">({result.total} entrées)</span>}
            </h2>
            <button
              onClick={() => refetch()}
              className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadingList ? (
            <div className="divide-y divide-zinc-800">
              {[0,1,2,3,4].map(i => <div key={i} className="h-16 animate-pulse bg-zinc-800/20" />)}
            </div>
          ) : profits.length === 0 ? (
            <div className="py-16 text-center text-zinc-600">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucune conversion FX enregistrée</p>
              <p className="text-xs mt-1">Les profits apparaîtront quand des dépôts multi-devises seront traités</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 bg-zinc-800/40">
                    <th className="px-4 py-2.5 text-left font-medium">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium">Devise</th>
                    <th className="px-4 py-2.5 text-right font-medium">Montant local</th>
                    <th className="px-4 py-2.5 text-right font-medium">Taux réel</th>
                    <th className="px-4 py-2.5 text-right font-medium">Taux client</th>
                    <th className="px-4 py-2.5 text-right font-medium">Montant XOF</th>
                    <th className="px-4 py-2.5 text-right font-medium">Profit</th>
                    <th className="px-4 py-2.5 text-center font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {profits.map(p => (
                    <tr key={p.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="bg-violet-600/15 text-violet-300 border border-violet-500/20 rounded-md px-1.5 py-0.5 font-bold">
                          {p.currency}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-white font-mono">
                        {p.localAmount.toLocaleString("fr-FR")} {p.currency}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400 font-mono">{p.realRate}</td>
                      <td className="px-4 py-3 text-right text-zinc-400 font-mono">{p.clientRate}</td>
                      <td className="px-4 py-3 text-right text-white font-mono">{p.amountXof.toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-400 font-mono">
                        +{p.profitXof.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                          p.status === "completed"
                            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                            : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                        )}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
