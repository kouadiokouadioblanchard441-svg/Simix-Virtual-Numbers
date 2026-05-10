import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type SecurityEvent } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Loader2, AlertTriangle, ShieldAlert, Info, Shield } from "lucide-react";

const SEVERITY_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  low: { color: "bg-blue-500/20 text-blue-400 border-blue-500/20", icon: Info, label: "Faible" },
  medium: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/20", icon: AlertTriangle, label: "Moyen" },
  high: { color: "bg-orange-500/20 text-orange-400 border-orange-500/20", icon: ShieldAlert, label: "Élevé" },
  critical: { color: "bg-red-500/20 text-red-400 border-red-500/20", icon: AlertTriangle, label: "Critique" },
};

function EventRow({ event }: { event: SecurityEvent }) {
  const cfg = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.low;
  const Icon = cfg.icon;

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
      <td className="py-3 px-4">
        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium border ${cfg.color}`}>
          <Icon className="w-3 h-3" /> {cfg.label}
        </span>
      </td>
      <td className="py-3 px-4 text-zinc-300 text-sm font-mono">{event.eventType}</td>
      <td className="py-3 px-4 text-zinc-400 text-xs font-mono">{event.ip ?? "—"}</td>
      <td className="py-3 px-4">
        {event.riskScore !== undefined && (
          <span className={`text-sm font-bold ${event.riskScore > 60 ? "text-red-400" : event.riskScore > 30 ? "text-emerald-400" : "text-emerald-400"}`}>
            {event.riskScore}
          </span>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="text-xs text-zinc-500 font-mono max-w-xs truncate">
          {event.details ? JSON.stringify(event.details) : "—"}
        </div>
      </td>
      <td className="py-3 px-4 text-zinc-500 text-xs whitespace-nowrap">{new Date(event.createdAt).toLocaleString("fr-FR")}</td>
    </tr>
  );
}

function SecurityContent() {
  const [filter, setFilter] = useState<string>("");

  const { data: events, isLoading } = useQuery({
    queryKey: ["admin-security", filter],
    queryFn: () => adminApi.getSecurityEvents(filter || undefined),
    refetchInterval: 60000,
  });

  const counts = {
    critical: events?.filter(e => e.severity === "critical").length ?? 0,
    high: events?.filter(e => e.severity === "high").length ?? 0,
    medium: events?.filter(e => e.severity === "medium").length ?? 0,
    low: events?.filter(e => e.severity === "low").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Sécurité & Surveillance</h1>
        <p className="text-zinc-400 text-sm mt-1">Événements de sécurité et activités suspectes</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(counts).map(([sev, n]) => {
          const cfg = SEVERITY_CONFIG[sev];
          const Icon = cfg.icon;
          return (
            <button key={sev} onClick={() => setFilter(filter === sev ? "" : sev)} className={`p-4 rounded-xl border transition-all ${filter === sev ? cfg.color + " border-current" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"}`}>
              <Icon className={`w-5 h-5 mb-2 ${filter === sev ? "" : "text-zinc-500"}`} />
              <div className={`text-2xl font-bold ${filter === sev ? "" : "text-white"}`}>{n}</div>
              <div className={`text-xs mt-0.5 ${filter === sev ? "" : "text-zinc-500"}`}>{cfg.label}</div>
            </button>
          );
        })}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div className="text-sm font-medium text-white">
            {filter ? `Événements "${SEVERITY_CONFIG[filter]?.label}"` : "Tous les événements"} ({events?.length ?? 0})
          </div>
          {filter && (
            <button onClick={() => setFilter("")} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">Effacer le filtre</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Sévérité", "Événement", "IP", "Score", "Détails", "Date"].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="py-16 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
              ) : events?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Shield className="w-10 h-10 text-zinc-700 mx-auto mb-2" />
                    <div className="text-zinc-500">Aucun événement de sécurité</div>
                  </td>
                </tr>
              ) : (
                events?.map(e => <EventRow key={e.id} event={e} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminSecurity() {
  return (
    <AdminGuard>
      <AdminLayout>
        <SecurityContent />
      </AdminLayout>
    </AdminGuard>
  );
}
