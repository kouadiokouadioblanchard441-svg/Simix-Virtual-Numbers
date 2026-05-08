import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type AdminAnalytics } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, TrendingUp, ShoppingBag, BarChart3, Users } from "lucide-react";

function MiniBar({ value, max, color = "bg-violet-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function RevenueChart({ data }: { data: AdminAnalytics["dailyRevenue"] }) {
  const max = Math.max(...data.map(d => d.revenue), 1);
  const last7 = data.slice(-14);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Revenus quotidiens</h2>
          <p className="text-zinc-500 text-xs mt-0.5">14 derniers jours</p>
        </div>
        <TrendingUp className="w-4 h-4 text-emerald-400" />
      </div>
      <div className="flex items-end gap-1 h-32">
        {last7.map((d, i) => {
          const pct = max > 0 ? (d.revenue / max) * 100 : 0;
          const date = new Date(d.date);
          const label = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {formatFCFA(d.revenue)} · {d.orders} cmd
              </div>
              <div className="w-full relative" style={{ height: "100px" }}>
                <div
                  className="absolute bottom-0 left-0 right-0 bg-violet-500/80 hover:bg-violet-400 rounded-sm transition-colors cursor-default"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="text-[9px] text-zinc-600 font-mono">{label.split("/")[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ServiceDonut({ data }: { data: AdminAnalytics["topServices"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const COLORS = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500"];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Top services</h2>
          <p className="text-zinc-500 text-xs mt-0.5">{total} commandes</p>
        </div>
        <ShoppingBag className="w-4 h-4 text-blue-400" />
      </div>
      <div className="space-y-3">
        {data.slice(0, 6).map((svc, i) => {
          const pct = total > 0 ? Math.round((svc.count / total) * 100) : 0;
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">{svc.name}</span>
                <span className="text-zinc-500">{svc.count} · {pct}%</span>
              </div>
              <MiniBar value={svc.count} max={total} color={COLORS[i % COLORS.length]} />
            </div>
          );
        })}
        {data.length === 0 && <div className="text-zinc-500 text-sm text-center py-4">Aucune donnée</div>}
      </div>
    </div>
  );
}

function CountryBars({ data }: { data: AdminAnalytics["topCountries"] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Top pays</h2>
          <p className="text-zinc-500 text-xs mt-0.5">Par nombre de commandes</p>
        </div>
        <BarChart3 className="w-4 h-4 text-cyan-400" />
      </div>
      <div className="space-y-3">
        {data.slice(0, 8).map((c, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300">{c.flag} {c.name}</span>
              <span className="text-zinc-500">{c.count}</span>
            </div>
            <MiniBar value={c.count} max={max} color="bg-cyan-500" />
          </div>
        ))}
        {data.length === 0 && <div className="text-zinc-500 text-sm text-center py-4">Aucune donnée</div>}
      </div>
    </div>
  );
}

function UserGrowthChart({ data }: { data: AdminAnalytics["userGrowth"] }) {
  const max = Math.max(...data.map(d => d.newUsers), 1);
  const last14 = data.slice(-14);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Nouveaux utilisateurs</h2>
          <p className="text-zinc-500 text-xs mt-0.5">14 derniers jours</p>
        </div>
        <Users className="w-4 h-4 text-orange-400" />
      </div>
      <div className="flex items-end gap-1 h-24">
        {last14.map((d, i) => {
          const pct = max > 0 ? (d.newUsers / max) * 100 : 0;
          const date = new Date(d.date);
          const label = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {d.newUsers} utilisateur{d.newUsers !== 1 ? "s" : ""}
              </div>
              <div className="w-full relative" style={{ height: "80px" }}>
                <div
                  className="absolute bottom-0 left-0 right-0 bg-orange-500/80 hover:bg-orange-400 rounded-sm transition-colors cursor-default"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="text-[9px] text-zinc-600 font-mono">{label.split("/")[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TxBreakdown({ data }: { data: AdminAnalytics["txBreakdown"] }) {
  const total = data.recharge + data.purchase + data.refund;
  const items = [
    { label: "Recharges", value: data.recharge, color: "bg-emerald-500", text: "text-emerald-400" },
    { label: "Achats", value: data.purchase, color: "bg-blue-500", text: "text-blue-400" },
    { label: "Remboursements", value: data.refund, color: "bg-orange-500", text: "text-orange-400" },
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Répartition des transactions</h2>
      <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-0.5">
        {items.map(it => (
          <div
            key={it.label}
            className={`${it.color} transition-all`}
            style={{ width: `${total > 0 ? (it.value / total) * 100 : 33}%` }}
          />
        ))}
      </div>
      <div className="space-y-2">
        {items.map(it => (
          <div key={it.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${it.color}`} />
              <span className="text-zinc-300">{it.label}</span>
            </div>
            <span className={`font-semibold ${it.text}`}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsContent() {
  const [days, setDays] = useState(30);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["admin-analytics", days],
    queryFn: () => adminApi.getAnalytics(days),
    refetchInterval: 120_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytiques</h1>
          <p className="text-zinc-400 text-sm mt-1">Performances et statistiques de la plateforme</p>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
        >
          <option value={7}>7 derniers jours</option>
          <option value={30}>30 derniers jours</option>
          <option value={90}>90 derniers jours</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
      ) : analytics ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Revenus {days}j</p>
              <p className="text-2xl font-bold text-white">{formatFCFA(analytics.totalRevenue30d)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Commandes {days}j</p>
              <p className="text-2xl font-bold text-white">{analytics.totalOrders30d}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Panier moyen</p>
              <p className="text-2xl font-bold text-white">{formatFCFA(analytics.avgOrderValue)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueChart data={analytics.dailyRevenue} />
            <UserGrowthChart data={analytics.userGrowth} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ServiceDonut data={analytics.topServices} />
            <CountryBars data={analytics.topCountries} />
            <TxBreakdown data={analytics.txBreakdown} />
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-zinc-500">Aucune donnée disponible</div>
      )}
    </div>
  );
}

export default function AdminAnalytics() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AnalyticsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
