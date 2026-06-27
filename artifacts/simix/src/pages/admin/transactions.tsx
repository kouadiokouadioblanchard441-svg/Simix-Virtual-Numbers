import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type AdminTransaction } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(";"),
    ...rows.map(r => keys.map(k => {
      const v = r[k] ?? "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    }).join(";")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

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
        <span className={`text-xs px-2 py-1 rounded-full ${tx.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-700 text-zinc-400"}`}>
          {tx.status === "completed" ? "Complété" : tx.status}
        </span>
      </td>
      <td className="py-3 px-4 text-zinc-400 text-xs hidden md:table-cell">{tx.method ?? "—"}</td>
      <td className="py-3 px-4 text-zinc-400 text-xs max-w-xs truncate hidden lg:table-cell">{tx.description ?? "—"}</td>
      <td className="py-3 px-4 text-zinc-400 text-xs hidden sm:table-cell">{new Date(tx.createdAt).toLocaleString("fr-FR")}</td>
    </tr>
  );
}

function TransactionsContent() {
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [exporting, setExporting] = useState(false);
  const PER_PAGE = 30;
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-transactions", page, typeFilter],
    queryFn: () => adminApi.getTransactions({
      limit: PER_PAGE,
      offset: page * PER_PAGE,
      type: typeFilter !== "Tous" ? typeFilter : undefined,
    }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PER_PAGE);

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await adminApi.getTransactions({
        export: true,
        type: typeFilter !== "Tous" ? typeFilter : undefined,
      });
      exportToCsv(`transactions_${new Date().toISOString().slice(0, 10)}.csv`, all.transactions.map(tx => ({
        ID: tx.id,
        Utilisateur: tx.userFullName,
        Téléphone: tx.userPhone,
        Type: TX_LABELS[tx.type] ?? tx.type,
        "Montant FCFA": tx.amount,
        Statut: tx.status,
        Méthode: tx.method ?? "",
        Description: tx.description ?? "",
        Date: new Date(tx.createdAt).toLocaleString("fr-FR"),
      })));
      toast({ title: `${all.transactions.length} transactions exportées` });
    } catch (e) {
      toast({ title: "Erreur export", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-zinc-400 text-sm mt-1">{data?.total ?? 0} transactions{typeFilter !== "Tous" ? ` · ${TX_LABELS[typeFilter] ?? typeFilter}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
          >
            <option value="Tous">Tous les types</option>
            <option value="recharge">Recharges</option>
            <option value="purchase">Achats</option>
            <option value="refund">Remboursements</option>
          </select>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors disabled:opacity-50"
            title="Exporter en CSV"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            CSV
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Utilisateur", "Type", "Montant", "Statut"].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                ))}
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden md:table-cell">Méthode</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden lg:table-cell">Description</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Date</th>
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
            <span className="text-xs text-zinc-500">Page {page + 1} sur {totalPages} — {data?.total} transactions</span>
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
