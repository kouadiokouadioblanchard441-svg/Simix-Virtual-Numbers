import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type RealtimeSms, type RealtimeActiveNumber } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import {
  MessageSquare,
  Phone,
  TrendingUp,
  ShoppingBag,
  Clock,
  Wifi,
  WifiOff,
  RefreshCw,
  User,
} from "lucide-react";

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

function timeUntil(dateStr: string): string {
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 1000);
  if (diff <= 0) return "Expiré";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h`;
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  pulse,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${color} relative`}>
        <Icon className="w-5 h-5 text-white" />
        {pulse && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-zinc-400 text-sm mt-0.5">{label}</div>
        {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function HourlyChart({ data }: { data: { hour: string; count: number }[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-24 text-zinc-600 text-sm">
        Aucune donnée sur 24h
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => {
        const pct = (d.count / max) * 100;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1 group relative"
          >
            <div
              className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10"
            >
              {d.hour} · {d.count} SMS
            </div>
            <div className="w-full relative" style={{ height: "80px" }}>
              <div
                className="absolute bottom-0 left-0 right-0 bg-violet-500/80 hover:bg-violet-400 rounded-sm transition-colors cursor-default"
                style={{ height: `${Math.max(pct, 4)}%` }}
              />
            </div>
            <span className="text-[8px] text-zinc-600 font-mono">
              {d.hour.split(":")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SmsFeed({ items, newIds }: { items: RealtimeSms[]; newIds: Set<string> }) {
  return (
    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
      {items.length === 0 && (
        <div className="text-zinc-500 text-sm text-center py-12">
          Aucun SMS reçu
        </div>
      )}
      {items.map((sms) => (
        <div
          key={sms.id}
          className={`rounded-xl border p-4 transition-all duration-500 ${
            newIds.has(sms.id)
              ? "border-violet-500/60 bg-violet-500/10 shadow-md shadow-violet-500/10"
              : "border-zinc-800 bg-zinc-900/60"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white text-sm font-semibold">
                    {sms.phoneNumber ?? sms.numberId.slice(0, 8) + "…"}
                  </span>
                  {sms.serviceName && (
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-medium">
                      {sms.serviceName}
                    </span>
                  )}
                  {newIds.has(sms.id) && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-semibold animate-pulse">
                      NOUVEAU
                    </span>
                  )}
                </div>
                <div className="text-zinc-500 text-xs mt-0.5">
                  De : {sms.sender}
                  {sms.userFullName && (
                    <> · <User className="w-2.5 h-2.5 inline mb-0.5" /> {sms.userFullName}</>
                  )}
                </div>
              </div>
            </div>
            <div className="text-zinc-500 text-xs flex-shrink-0 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(sms.receivedAt)}
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-zinc-300 text-sm leading-relaxed">{sms.body}</p>
            {sms.code && (
              <div className="inline-flex items-center gap-2 bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-1.5 mt-1">
                <span className="text-zinc-500 text-xs">Code :</span>
                <span className="text-emerald-400 font-bold font-mono tracking-widest text-sm">
                  {sms.code}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActiveNumbersList({ items }: { items: RealtimeActiveNumber[] }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
      {items.length === 0 && (
        <div className="text-zinc-500 text-sm text-center py-12">
          Aucun numéro actif
        </div>
      )}
      {items.map((num) => {
        const remaining = timeUntil(num.expiresAt);
        const isExpiringSoon =
          new Date(num.expiresAt).getTime() - Date.now() < 5 * 60 * 1000;
        return (
          <div
            key={num.id}
            className={`rounded-xl border p-4 ${
              isExpiringSoon
                ? "border-orange-500/40 bg-orange-500/5"
                : "border-zinc-800 bg-zinc-900/60"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-sm font-mono font-semibold">
                      {num.phoneNumber}
                    </span>
                    {num.countryFlag && (
                      <span className="text-base">{num.countryFlag}</span>
                    )}
                    {num.serviceName && (
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                        {num.serviceName}
                      </span>
                    )}
                  </div>
                  <div className="text-zinc-500 text-xs mt-0.5">
                    {num.userFullName ?? num.userPhone ?? "Utilisateur inconnu"}
                    {num.countryName && ` · ${num.countryName}`}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span
                  className={`text-xs font-mono font-semibold ${
                    isExpiringSoon ? "text-orange-400 animate-pulse" : "text-emerald-400"
                  }`}
                >
                  {remaining}
                </span>
                <span className="text-zinc-600 text-xs">{formatFCFA(num.price)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RealtimeContent() {
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-realtime"],
    queryFn: () => adminApi.getRealtimeData(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!data) return;
    const currentIds = new Set(data.recentSms.map((s) => s.id));
    const added = new Set<string>();
    currentIds.forEach((id) => {
      if (!prevIdsRef.current.has(id)) added.add(id);
    });
    if (added.size > 0) {
      setNewIds(added);
      setTimeout(() => setNewIds(new Set()), 8000);
    }
    prevIdsRef.current = currentIds;
    setLastRefresh(new Date());
  }, [data]);

  const isOnline = !isLoading && !!data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Temps réel
            <span
              className={`w-2 h-2 rounded-full mt-1 ${
                isOnline ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
              }`}
            />
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            SMS reçus · Numéros actifs · Revenus — rafraîchi toutes les 10s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-red-400" />
            )}
            {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="SMS reçus aujourd'hui"
          value={data?.smsToday ?? 0}
          sub={`${data?.recentSms.length ?? 0} dans le flux`}
          icon={MessageSquare}
          color="bg-violet-600"
          pulse
        />
        <StatCard
          label="Numéros actifs"
          value={data?.activeNumbersCount ?? 0}
          sub="En attente de SMS"
          icon={Phone}
          color="bg-blue-600"
          pulse={!!data?.activeNumbersCount}
        />
        <StatCard
          label="Revenus aujourd'hui"
          value={formatFCFA(data?.revenue.today ?? 0)}
          sub={`Ce mois : ${formatFCFA(data?.revenue.month ?? 0)}`}
          icon={TrendingUp}
          color="bg-emerald-600"
        />
        <StatCard
          label="Commandes aujourd'hui"
          value={data?.ordersToday ?? 0}
          sub={`Total : ${formatFCFA(data?.revenue.total ?? 0)}`}
          icon={ShoppingBag}
          color="bg-orange-600"
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-white">SMS par heure</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Dernières 24 heures</p>
          </div>
          <MessageSquare className="w-4 h-4 text-violet-400" />
        </div>
        {isLoading ? (
          <div className="h-24 bg-zinc-800/50 rounded animate-pulse" />
        ) : (
          <HourlyChart data={data?.hourlySms ?? []} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                Flux SMS en direct
                {newIds.size > 0 && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-semibold animate-pulse">
                    +{newIds.size} nouveau{newIds.size > 1 ? "x" : ""}
                  </span>
                )}
              </h2>
              <p className="text-zinc-500 text-xs mt-0.5">40 derniers messages</p>
            </div>
            <MessageSquare className="w-4 h-4 text-violet-400" />
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-zinc-800/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <SmsFeed items={data?.recentSms ?? []} newIds={newIds} />
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Numéros actifs</h2>
              <p className="text-zinc-500 text-xs mt-0.5">
                En attente de SMS — expiration en direct
              </p>
            </div>
            <Phone className="w-4 h-4 text-blue-400" />
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-zinc-800/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <ActiveNumbersList items={data?.activeNumbers ?? []} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Cette semaine", value: formatFCFA(data?.revenue.week ?? 0), color: "text-violet-400" },
          { label: "Ce mois", value: formatFCFA(data?.revenue.month ?? 0), color: "text-blue-400" },
          { label: "Total cumulé", value: formatFCFA(data?.revenue.total ?? 0), color: "text-emerald-400" },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-between"
          >
            <div>
              <div className="text-zinc-400 text-xs font-medium">{item.label}</div>
              <div className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</div>
            </div>
            <TrendingUp className={`w-5 h-5 ${item.color} opacity-60`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminRealtime() {
  return (
    <AdminGuard>
      <AdminLayout>
        <RealtimeContent />
      </AdminLayout>
    </AdminGuard>
  );
}
