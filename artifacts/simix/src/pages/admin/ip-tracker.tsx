import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type LoginHistoryEntry } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import {
  Loader2, MapPin, Monitor, Smartphone, Search, Ban,
  CheckCircle2, XCircle, TrendingUp, Globe, Users, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function DeviceIcon({ type }: { type: string | null }) {
  if (type === "mobile") return <Smartphone className="w-3.5 h-3.5 text-violet-400" />;
  return <Monitor className="w-3.5 h-3.5 text-blue-400" />;
}

function IpTrackerContent() {
  const [search, setSearch] = useState("");
  const [successFilter, setSuccessFilter] = useState<"" | "true" | "false">("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-login-history"],
    queryFn: () => adminApi.getLoginHistory(),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-login-stats"],
    queryFn: () => adminApi.getLoginHistoryStats(),
    refetchInterval: 60000,
  });

  const banIp = useMutation({
    mutationFn: (ip: string) => adminApi.addBlacklist({ type: "ip", value: ip, reason: "Banni depuis le journal de connexion", permanent: true }),
    onSuccess: () => {
      toast({ title: "IP bannie avec succès" });
      qc.invalidateQueries({ queryKey: ["admin-login-history"] });
      qc.invalidateQueries({ queryKey: ["admin-blacklist"] });
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const entries = data?.entries ?? [];
  const filtered = entries.filter(e => {
    const matchSearch = !search || (e.ip ?? "").includes(search) || (e.userFullName ?? "").toLowerCase().includes(search.toLowerCase()) || (e.userPhone ?? "").includes(search) || (e.country ?? "").toLowerCase().includes(search.toLowerCase());
    const matchSuccess = !successFilter || e.success === successFilter;
    return matchSearch && matchSuccess;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <MapPin className="w-6 h-6 text-violet-400" />
          Traçabilité & IP Tracker
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Historique des connexions avec adresses IP, localisation et appareil</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <Globe className="w-5 h-5 text-blue-400 mb-2" />
          <div className="text-2xl font-bold text-white">{stats?.total ?? "—"}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Connexions totales</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 mb-2" />
          <div className="text-2xl font-bold text-white">{stats?.today ?? "—"}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Aujourd'hui</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <XCircle className="w-5 h-5 text-red-400 mb-2" />
          <div className="text-2xl font-bold text-white">{stats?.failedThisWeek ?? "—"}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Échecs cette semaine</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <Users className="w-5 h-5 text-violet-400 mb-2" />
          <div className="text-2xl font-bold text-white">{stats?.topIps?.length ?? "—"}</div>
          <div className="text-xs text-zinc-500 mt-0.5">IPs uniques</div>
        </div>
      </div>

      {/* Top IPs */}
      {stats?.topIps && stats.topIps.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold text-white">IPs les plus actives (7j)</span>
            </div>
            {stats.topIps.map(({ ip, c }) => (
              <div key={ip} className="flex items-center justify-between">
                <span className="text-sm font-mono text-zinc-300">{ip ?? "—"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{c} connexions</span>
                  <button
                    onClick={() => ip && banIp.mutate(ip)}
                    disabled={!ip || banIp.isPending}
                    className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Bannir cette IP"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Pays (7j)</span>
            </div>
            {stats.topCountries?.map(({ country, c }) => (
              <div key={country} className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">{country ?? "Inconnu"}</span>
                <span className="text-xs text-zinc-500">{c} connexions</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher IP, utilisateur, pays..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>
        <select
          value={successFilter}
          onChange={e => setSuccessFilter(e.target.value as typeof successFilter)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
        >
          <option value="">Toutes connexions</option>
          <option value="true">Réussies seulement</option>
          <option value="false">Échouées seulement</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <span className="text-sm text-zinc-400">{filtered.length} connexion{filtered.length !== 1 ? "s" : ""} affichée{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">Aucune connexion enregistrée</p>
            <p className="text-zinc-600 text-xs mt-1">Les nouvelles connexions apparaîtront ici automatiquement</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Statut</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Utilisateur</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Adresse IP</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Localisation</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Appareil</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Date</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Bannir IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                    <td className="py-3 px-4">
                      {e.success === "true" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> OK</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-400"><XCircle className="w-3.5 h-3.5" /> Échec</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-white">{e.userFullName ?? "Inconnu"}</div>
                      <div className="text-xs text-zinc-500">{e.userPhone ?? e.userEmail ?? "—"}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-zinc-300">{e.ip ?? "—"}</td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-zinc-300">{[e.city, e.region, e.country].filter(Boolean).join(", ") || "—"}</div>
                      {e.isp && <div className="text-xs text-zinc-600 truncate max-w-[150px]">{e.isp}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <DeviceIcon type={e.deviceType ?? null} />
                        <span className="text-xs text-zinc-400 capitalize">{e.deviceType ?? "—"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleString("fr-FR")}</td>
                    <td className="py-3 px-4">
                      {e.ip && (
                        <button
                          onClick={() => { if (confirm(`Bannir l'IP ${e.ip} ?`)) banIp.mutate(e.ip!); }}
                          disabled={banIp.isPending}
                          className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                          title={`Bannir ${e.ip}`}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-300 text-sm font-medium">Note sur la géolocalisation</p>
          <p className="text-blue-400/70 text-xs mt-1">
            La localisation (pays, ville) est déterminée à partir de l'adresse IP. Elle peut être approximative.
            Les connexions via VPN ou proxy peuvent indiquer un pays différent du pays réel de l'utilisateur.
            Cliquez sur "Bannir IP" pour ajouter directement à la liste noire.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminIpTracker() {
  return (
    <AdminGuard>
      <AdminLayout>
        <IpTrackerContent />
      </AdminLayout>
    </AdminGuard>
  );
}
