import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type SyncLogEntry, type SyncStatus } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import {
  RefreshCw, Globe, Server, ShieldCheck, CheckCircle2,
  XCircle, AlertTriangle, Clock, Zap, ChevronDown, ChevronRight,
  Database, Tag, Activity, Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ─── Helpers ─── */
function relativeTime(iso: string | null): string {
  if (!iso) return "Jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "À l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h}h`;
  return `Il y a ${Math.floor(h / 24)}j`;
}

function durationLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function typeLabel(type: SyncLogEntry["type"]): string {
  return type === "full" ? "Sync complet" : type === "services" ? "Services" : "Pays";
}

function typeBadge(type: SyncLogEntry["type"]) {
  const cls = type === "full"
    ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
    : type === "services"
    ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border", cls)}>
      {typeLabel(type)}
    </span>
  );
}

function statusBadge(status: SyncLogEntry["status"]) {
  if (status === "success") return (
    <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
      <CheckCircle2 className="w-3.5 h-3.5" /> Succès
    </span>
  );
  if (status === "partial") return (
    <span className="flex items-center gap-1 text-amber-400 text-xs font-semibold">
      <AlertTriangle className="w-3.5 h-3.5" /> Partiel
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
      <XCircle className="w-3.5 h-3.5" /> Échec
    </span>
  );
}

/* ─── Stat card ─── */
function StatCard({ icon: Icon, label, value, sub, color = "violet" }: {
  icon: React.ElementType; label: string; value: number | string; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    blue:   "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
    rose:   "text-rose-400 bg-rose-500/10 border-rose-500/20",
  };
  const cls = colorMap[color] ?? colorMap.violet;
  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex items-start gap-4">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border", cls)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">{label}</div>
        <div className="text-xl font-bold text-white mt-0.5">{value.toLocaleString("fr-FR")}</div>
        {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Sync button ─── */
function SyncButton({ label, icon: Icon, onClick, loading, disabled, color = "violet" }: {
  label: string; icon: React.ElementType;
  onClick: () => void; loading: boolean; disabled: boolean; color?: string;
}) {
  const colorMap: Record<string, string> = {
    violet: "bg-violet-600 hover:bg-violet-500 shadow-violet-500/25",
    blue:   "bg-blue-600 hover:bg-blue-500 shadow-blue-500/25",
    emerald:"bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all shadow-md",
        colorMap[color],
        (disabled || loading) && "opacity-50 cursor-not-allowed"
      )}
    >
      <Icon className={cn("w-4 h-4", loading && "animate-spin")} />
      {loading ? "En cours…" : label}
    </button>
  );
}

/* ─── Log row (expandable) ─── */
function LogRow({ entry }: { entry: SyncLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasErrors = entry.errors.length > 0;

  return (
    <div className={cn(
      "border rounded-xl overflow-hidden transition-colors",
      entry.status === "failed" ? "border-red-500/30" :
      entry.status === "partial" ? "border-amber-500/20" : "border-zinc-800"
    )}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />}

        <div className="flex items-center gap-2 flex-shrink-0">
          {typeBadge(entry.type)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            {statusBadge(entry.status)}
            <span className="text-zinc-400 text-xs flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(entry.startedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </span>
            <span className="text-zinc-500 text-xs">{durationLabel(entry.durationMs)}</span>
            <span className="text-zinc-600 text-xs">{entry.triggeredBy === "admin" ? "Manuel" : "Auto"}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0 text-xs text-zinc-500">
          {entry.services && (
            <span className="hidden sm:inline">
              +{entry.services.added} · ~{entry.services.updated} svc
            </span>
          )}
          {entry.countries && entry.type !== "full" && (
            <span className="hidden sm:inline">
              +{entry.countries.added} pays
            </span>
          )}
          {hasErrors && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {entry.errors.length}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4 bg-zinc-900/40">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {entry.services && (
              <>
                <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-white">+{entry.services.added}</div>
                  <div className="text-[11px] text-zinc-500">Services ajoutés</div>
                </div>
                <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-white">{entry.services.updated}</div>
                  <div className="text-[11px] text-zinc-500">Mis à jour</div>
                </div>
                <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-violet-300">{entry.services.priceProtected}</div>
                  <div className="text-[11px] text-zinc-500">Prix protégés</div>
                </div>
                <div className={cn("rounded-xl p-3 text-center", entry.services.countryErrors > 0 ? "bg-amber-500/10" : "bg-zinc-800/60")}>
                  <div className={cn("text-lg font-bold", entry.services.countryErrors > 0 ? "text-amber-400" : "text-white")}>
                    {entry.services.countryErrors}
                  </div>
                  <div className="text-[11px] text-zinc-500">Erreurs pays</div>
                </div>
              </>
            )}
            {entry.countries && (
              <>
                <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-white">+{entry.countries.added}</div>
                  <div className="text-[11px] text-zinc-500">Pays ajoutés</div>
                </div>
                <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-white">{entry.countries.updated}</div>
                  <div className="text-[11px] text-zinc-500">Pays mis à jour</div>
                </div>
                <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-white">{entry.countries.total}</div>
                  <div className="text-[11px] text-zinc-500">Total pays</div>
                </div>
              </>
            )}
          </div>

          {hasErrors && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-amber-400 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Erreurs ({entry.errors.length})
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {entry.errors.map((e, i) => (
                  <div key={i} className="text-xs text-zinc-400 bg-zinc-800/80 px-3 py-1.5 rounded-lg font-mono">
                    {e}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Price Protection Info ─── */
function PriceProtectionInfo({ protected: prot, custom }: { protected: number; custom: number }) {
  return (
    <div className="bg-gradient-to-br from-violet-950/40 to-zinc-900 border border-violet-700/30 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-4.5 h-4.5 text-violet-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Protection des prix admin</h3>
          <p className="text-zinc-400 text-xs">Les prix personnalisés ne sont jamais écrasés par la synchronisation</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900/60 rounded-xl p-3 text-center border border-violet-500/20">
          <div className="text-lg font-bold text-violet-300">{prot}</div>
          <div className="text-[11px] text-zinc-500">Services à prix protégé</div>
          <div className="text-[10px] text-zinc-600 mt-0.5">Prix global modifié manuellement</div>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-3 text-center border border-blue-500/20">
          <div className="text-lg font-bold text-blue-300">{custom}</div>
          <div className="text-[11px] text-zinc-500">Règles de prix par pays</div>
          <div className="text-[10px] text-zinc-600 mt-0.5">Tarification pays-service</div>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-start gap-2 text-xs text-zinc-400">
          <Lock className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
          <span>Le prix de vente est préservé si l'écart avec le calcul automatique dépasse 10 FCFA.</span>
        </div>
        <div className="flex items-start gap-2 text-xs text-zinc-400">
          <Lock className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
          <span>Les prix par pays (table <code className="text-zinc-300">service_prices</code>) ne sont jamais touchés par la synchronisation.</span>
        </div>
        <div className="flex items-start gap-2 text-xs text-zinc-400">
          <Activity className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span>Le prix fournisseur (5sim) et le stock sont toujours mis à jour, quelle que soit la protection.</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Last Sync Status card ─── */
function SyncStatusCard({ status }: { status: SyncStatus }) {
  const lastLog = status.logs[0];

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={cn(
          "w-2.5 h-2.5 rounded-full flex-shrink-0",
          status.inProgress ? "bg-blue-400 animate-pulse" :
          lastLog?.status === "success" ? "bg-emerald-400" :
          lastLog?.status === "partial" ? "bg-amber-400" :
          lastLog ? "bg-red-400" : "bg-zinc-600"
        )} />
        <h3 className="text-white font-semibold text-sm">
          {status.inProgress ? "Synchronisation en cours…" : "Dernière synchronisation"}
        </h3>
        {lastLog && !status.inProgress && statusBadge(lastLog.status)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-zinc-800/50 rounded-xl p-3">
          <div className="text-[11px] text-zinc-500 mb-1">Services (produits)</div>
          <div className="text-white text-sm font-medium">{relativeTime(status.lastServicesSync)}</div>
          {status.lastServiceStatus && (
            <div className="text-[11px] text-zinc-500 mt-1 truncate">{status.lastServiceStatus}</div>
          )}
        </div>
        <div className="bg-zinc-800/50 rounded-xl p-3">
          <div className="text-[11px] text-zinc-500 mb-1">Pays</div>
          <div className="text-white text-sm font-medium">{relativeTime(status.lastCountriesSync)}</div>
          {status.lastCountryStatus && (
            <div className="text-[11px] text-zinc-500 mt-1 truncate">{status.lastCountryStatus}</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-600">
        <Clock className="w-3 h-3" />
        Synchronisation automatique toutes les 6 heures
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export default function AdminSync() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["admin-sync-status"],
    queryFn: adminApi.getSyncDashboard,
    staleTime: 10_000,
    refetchInterval: (data) => ((data as unknown) as SyncStatus | undefined)?.inProgress ? 3000 : 30_000,
  });

  const syncFull = useMutation({
    mutationFn: adminApi.syncFull,
    onSuccess: (res) => {
      toast({ title: "Sync complet terminé", description: res.message });
      void qc.invalidateQueries({ queryKey: ["admin-sync-status"] });
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const syncServices = useMutation({
    mutationFn: adminApi.syncServices,
    onSuccess: (res) => {
      toast({ title: "Services synchronisés", description: res.message });
      void qc.invalidateQueries({ queryKey: ["admin-sync-status"] });
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const syncCountries = useMutation({
    mutationFn: adminApi.syncCountries,
    onSuccess: (res) => {
      toast({ title: "Pays synchronisés", description: res.message });
      void qc.invalidateQueries({ queryKey: ["admin-sync-status"] });
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const inProgress = status?.inProgress || syncFull.isPending || syncServices.isPending || syncCountries.isPending;

  return (
    <AdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white">Synchronisation 5sim</h1>
              <p className="text-zinc-400 text-sm mt-1">
                Gestion du catalogue de services, pays et prix depuis l'API 5sim
              </p>
            </div>
            <button
              onClick={() => void refetch()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 text-zinc-400 hover:text-white text-sm transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              Rafraîchir
            </button>
          </div>

          {/* Sync Actions */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold text-sm mb-1">Actions de synchronisation</h2>
            <p className="text-zinc-500 text-xs mb-4">
              La synchronisation est non-destructive : les données existantes sont mises à jour, rien n'est supprimé.
            </p>
            <div className="flex flex-wrap gap-3">
              <SyncButton
                label="Sync complet"
                icon={inProgress && syncFull.isPending ? RefreshCw : Zap}
                onClick={() => syncFull.mutate()}
                loading={syncFull.isPending}
                disabled={!!(inProgress && !syncFull.isPending)}
                color="violet"
              />
              <SyncButton
                label="Sync services"
                icon={inProgress && syncServices.isPending ? RefreshCw : Server}
                onClick={() => syncServices.mutate()}
                loading={syncServices.isPending}
                disabled={!!(inProgress && !syncServices.isPending)}
                color="blue"
              />
              <SyncButton
                label="Sync pays"
                icon={inProgress && syncCountries.isPending ? RefreshCw : Globe}
                onClick={() => syncCountries.mutate()}
                loading={syncCountries.isPending}
                disabled={!!(inProgress && !syncCountries.isPending)}
                color="emerald"
              />
            </div>
            {inProgress && (
              <div className="mt-4 flex items-center gap-2 text-blue-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Synchronisation en cours, veuillez patienter…
              </div>
            )}
          </div>

          {/* Status + Price Protection row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {status ? (
              <SyncStatusCard status={status} />
            ) : (
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex items-center justify-center h-40">
                <RefreshCw className="w-6 h-6 animate-spin text-zinc-600" />
              </div>
            )}
            {status ? (
              <PriceProtectionInfo
                protected={status.stats.priceProtected}
                custom={status.stats.customPriceRules}
              />
            ) : (
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 h-40" />
            )}
          </div>

          {/* Stats grid */}
          {status && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard icon={Server} label="Services totaux" value={status.stats.totalServices} color="blue" />
              <StatCard icon={Activity} label="Services actifs" value={status.stats.enabledServices} color="emerald" />
              <StatCard icon={Globe} label="Pays" value={status.stats.totalCountries} color="violet" />
              <StatCard icon={Lock} label="Prix protégés" value={status.stats.priceProtected} sub="Prix admin personnalisés" color="amber" />
              <StatCard icon={Tag} label="Règles par pays" value={status.stats.customPriceRules} sub="Prix pays-service" color="rose" />
            </div>
          )}

          {/* Sync Log History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                <Database className="w-4 h-4 text-zinc-500" />
                Historique des synchronisations
                {status?.logs.length ? (
                  <span className="text-[11px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md">
                    {status.logs.length} entrées
                  </span>
                ) : null}
              </h2>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center py-12 text-zinc-600">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
            )}

            {!isLoading && (!status?.logs.length) && (
              <div className="text-center py-12 text-zinc-600">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Aucun historique — lancez une synchronisation pour commencer.</p>
              </div>
            )}

            {status?.logs.length ? (
              <div className="space-y-2">
                {status.logs.map((entry) => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
