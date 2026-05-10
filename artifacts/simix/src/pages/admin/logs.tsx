import { useQuery } from "@tanstack/react-query";
import { adminApi, type AdminLogEntry } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Loader2, FileText } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  block_user: "bg-red-500/20 text-red-400",
  unblock_user: "bg-emerald-500/20 text-emerald-400",
  delete_user: "bg-red-600/20 text-red-500",
  adjust_balance: "bg-blue-500/20 text-blue-400",
  update_service: "bg-violet-500/20 text-violet-400",
  update_country: "bg-cyan-500/20 text-cyan-400",
  create_provider: "bg-emerald-500/20 text-emerald-400",
  update_provider: "bg-emerald-500/20 text-emerald-400",
  delete_provider: "bg-red-500/20 text-red-400",
  update_settings: "bg-orange-500/20 text-orange-400",
  cancel_order: "bg-orange-500/20 text-orange-400",
  promote_admin: "bg-violet-600/20 text-violet-300",
  demote_admin: "bg-zinc-600/20 text-zinc-400",
};

function LogRow({ log }: { log: AdminLogEntry }) {
  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/20 transition-colors">
      <td className="py-3 px-4 text-zinc-300 text-sm">{log.adminName ?? "Inconnu"}</td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-1 rounded-full font-medium font-mono ${ACTION_COLORS[log.action] ?? "bg-zinc-700 text-zinc-400"}`}>
          {log.action}
        </span>
      </td>
      <td className="py-3 px-4 text-zinc-500 text-xs">
        {log.targetType && <span className="text-zinc-600">{log.targetType}:</span>}
        {" "}{log.targetId?.slice(0, 10) ?? "—"}
      </td>
      <td className="py-3 px-4 text-zinc-400 text-xs font-mono max-w-xs truncate">
        {log.details ? JSON.stringify(log.details).slice(0, 80) : "—"}
      </td>
      <td className="py-3 px-4 text-zinc-500 text-xs">{log.ip ?? "—"}</td>
      <td className="py-3 px-4 text-zinc-500 text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString("fr-FR")}</td>
    </tr>
  );
}

function LogsContent() {
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["admin-logs"],
    queryFn: adminApi.getLogs,
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Journal des actions</h1>
          <p className="text-zinc-400 text-sm mt-1">Toutes les actions effectuées par les administrateurs</p>
        </div>
        <button onClick={() => refetch()} className="text-xs text-violet-400 hover:text-violet-300 transition-colors border border-zinc-700 hover:border-violet-500 px-3 py-1.5 rounded-lg">
          Actualiser
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Admin", "Action", "Cible", "Détails", "IP", "Date"].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="py-16 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
              ) : logs?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <FileText className="w-10 h-10 text-zinc-700 mx-auto mb-2" />
                    <div className="text-zinc-500">Aucune action enregistrée</div>
                  </td>
                </tr>
              ) : (
                logs?.map(log => <LogRow key={log.id} log={log} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminLogs() {
  return (
    <AdminGuard>
      <AdminLayout>
        <LogsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
