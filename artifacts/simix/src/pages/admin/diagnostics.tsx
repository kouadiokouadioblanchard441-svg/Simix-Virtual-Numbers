import { useQuery } from "@tanstack/react-query";
import { adminApi, type DiagnosticCheck } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2,
  Database, Shield, Zap, CreditCard, MessageSquare, Globe, Server,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  database:     Database,
  google:       Globe,
  pawapay:      CreditCard,
  fivesim:      Zap,
  session:      Shield,
  sms_simulator: MessageSquare,
  environment:  Server,
};

function StatusBadge({ status }: { status: DiagnosticCheck["status"] }) {
  if (status === "ok")    return <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-sm"><CheckCircle2 className="w-4 h-4" />OK</span>;
  if (status === "warn")  return <span className="flex items-center gap-1.5 text-amber-400 font-semibold text-sm"><AlertTriangle className="w-4 h-4" />Attention</span>;
  return <span className="flex items-center gap-1.5 text-red-400 font-semibold text-sm"><XCircle className="w-4 h-4" />Erreur</span>;
}

function CheckCard({ check }: { check: DiagnosticCheck }) {
  const Icon = ICON_MAP[check.name] ?? Server;
  const borderColor =
    check.status === "ok"   ? "border-emerald-800/40" :
    check.status === "warn" ? "border-amber-700/40"   : "border-red-800/40";
  const bg =
    check.status === "ok"   ? "from-emerald-950/30 to-zinc-900" :
    check.status === "warn" ? "from-amber-950/30 to-zinc-900"   : "from-red-950/30 to-zinc-900";
  const iconBg =
    check.status === "ok"   ? "bg-emerald-600" :
    check.status === "warn" ? "bg-amber-600"   : "bg-red-600";

  return (
    <div className={`bg-gradient-to-br ${bg} border ${borderColor} rounded-2xl p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shadow-lg`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-base">{check.label}</span>
        </div>
        <StatusBadge status={check.status} />
      </div>
      <p className="text-zinc-400 text-sm leading-relaxed">{check.detail}</p>
      {check.latencyMs !== undefined && (
        <p className="text-zinc-500 text-xs">Latence : {check.latencyMs} ms</p>
      )}
    </div>
  );
}

function DiagnosticsContent() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn:  adminApi.getDiagnostics,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("fr-FR") : null;
  const errCount  = data?.checks.filter(c => c.status === "error").length ?? 0;
  const warnCount = data?.checks.filter(c => c.status === "warn").length ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-2xl">Diagnostics système</h1>
          <p className="text-zinc-400 text-sm mt-1">
            État en temps réel de toutes les intégrations
            {updatedAt && <span className="ml-2 text-zinc-500">· Mis à jour à {updatedAt}</span>}
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-sm transition-colors disabled:opacity-50"
        >
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Rafraîchir
        </button>
      </div>

      {/* Global banner */}
      {!isLoading && data && (
        <div className={`rounded-2xl px-5 py-4 border flex items-center gap-3 ${
          errCount > 0
            ? "bg-red-950/40 border-red-800/40 text-red-300"
            : warnCount > 0
            ? "bg-amber-950/40 border-amber-700/40 text-amber-300"
            : "bg-emerald-950/40 border-emerald-800/40 text-emerald-300"
        }`}>
          {errCount > 0
            ? <><XCircle className="w-5 h-5 shrink-0" /><span className="font-semibold">{errCount} erreur{errCount > 1 ? "s" : ""} critique{errCount > 1 ? "s" : ""} détectée{errCount > 1 ? "s" : ""}</span></>
            : warnCount > 0
            ? <><AlertTriangle className="w-5 h-5 shrink-0" /><span className="font-semibold">{warnCount} avertissement{warnCount > 1 ? "s" : ""} — certaines intégrations nécessitent une attention</span></>
            : <><CheckCircle2 className="w-5 h-5 shrink-0" /><span className="font-semibold">Toutes les intégrations sont opérationnelles</span></>
          }
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center py-16 gap-4 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
          <p>Vérification des intégrations en cours…</p>
        </div>
      )}

      {/* Cards */}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.checks.map(check => (
            <CheckCard key={check.name} check={check} />
          ))}
        </div>
      )}

      {/* Google OAuth hint */}
      {data?.checks.find(c => c.name === "google" && c.status !== "ok") && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-2">
          <p className="text-white font-semibold text-sm">Configurer Google OAuth</p>
          <ol className="text-zinc-400 text-sm space-y-1 list-decimal list-inside">
            <li>Allez sur <span className="text-violet-400">console.cloud.google.com</span> → APIs &amp; Services → Credentials</li>
            <li>Ajoutez <span className="font-mono text-xs bg-zinc-800 px-1 rounded">GOOGLE_CLIENT_ID</span> et <span className="font-mono text-xs bg-zinc-800 px-1 rounded">GOOGLE_CLIENT_SECRET</span> dans les secrets Replit</li>
            <li>Ajoutez l'URI de callback autorisée dans Google Console</li>
          </ol>
        </div>
      )}
    </div>
  );
}

export default function AdminDiagnostics() {
  return (
    <AdminGuard>
      <AdminLayout>
        <DiagnosticsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
