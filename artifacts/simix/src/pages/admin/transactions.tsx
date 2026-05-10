import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type AdminTransaction } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const TX_COLORS: Record<string, string> = {
  recharge: "bg-emerald-500/20 text-emerald-400",
  purchase: "bg-blue-500/20 text-blue-400",
  refund: "bg-orange-500/20 text-orange-400",
};

const TX_LABELS: Record<string, string> = {
  recharge: "Recharge",
  purchase: "Achat",
  refund: "Remboursement",
};

function TxRow({ tx }: { tx: AdminTransaction }) {
  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
      <td className="py-3 px-4">
        <div className="text-zinc-300 text-sm">{tx.userFullName}</div>
        <div className="text-zinc-500 text-xs">{tx.userPhone}</div>
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${TX_COLORS[tx.type] ?? "bg-zinc-700 text-zinc-400"}`}>
          {TX_LABELS[tx.type] ?? tx.type}
        </span>
      </td>
      <td className={`py-3 px-4 text-sm font-bold ${tx.type === "recharge" ? "text-emerald-400" : tx.type === "refund" ? "text-orange-400" : "text-white"}`}>
        {tx.type === "purchase" ? "-" : "+"}{formatFCFA(tx.amount)}
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-1 rounded-full ${tx.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-500/20 text-emerald-400"}`}>
          {tx.status === "completed" ? "Complété" : tx.status}
        </span>
      </td>
      <td className="py-3 px-4 text-zinc-400 text-xs">{tx.method ?? "—"}</td>
      <td className="py-3 px-4 text-zinc-400 text-xs max-w-xs truncate">{tx.description ?? "—"}</td>
      <td className="py-3 px-4 text-zinc-400 text-xs">{new Date(tx.createdAt).toLocaleString("fr-FR")}</td>
    </tr>
  );
}

function TransactionsContent() {
  const [page, setPage] = useState(0);
  const PER_PAGE = 30;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-transactions", page],
    queryFn: () => adminApi.getTransactions({ limit: PER_PAGE, offset: page * PER_PAGE }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PER_PAGE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Transactions</h1>
        <p className="text-zinc-400 text-sm mt-1">{data?.total ?? 0} transactions au total</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Utilisateur", "Type", "Montant", "Statut", "Méthode", "Description", "Date"].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
              ) : data?.transactions.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-zinc-500">Aucune transaction</td></tr>
              ) : (
                data?.transactions.map(tx => <TxRow key={tx.id} tx={tx} />)
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <span className="text-xs text-zinc-500">Page {page + 1} sur {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronLeft className="w-4 h-4 text-zinc-400" /></button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4 text-zinc-400" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminTransactions() {
  return (
    <AdminGuard>
      <AdminLayout>
        <TransactionsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
