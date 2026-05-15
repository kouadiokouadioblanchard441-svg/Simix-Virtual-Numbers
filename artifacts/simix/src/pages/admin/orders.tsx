import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminOrder } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  waiting: "bg-emerald-500/20 text-emerald-400",
  received: "bg-emerald-500/20 text-emerald-400",
  expired: "bg-zinc-700 text-zinc-400",
  cancelled: "bg-red-500/20 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  waiting: "En attente",
  received: "Reçu",
  expired: "Expiré",
  cancelled: "Annulé",
};

function OrderRow({ order }: { order: AdminOrder }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const cancel = useMutation({
    mutationFn: () => adminApi.cancelOrder(order.id),
    onSuccess: () => { toast({ title: "Commande annulée et remboursée" }); qc.invalidateQueries({ queryKey: ["admin-orders"] }); },
    onError: (e) => toast({ title: "Commande non mise à jour", description: (e as Error).message, variant: "destructive" }),
  });

  const expiresAt = new Date(order.expiresAt);
  const isExpired = expiresAt < new Date();

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
      <td className="py-3 px-4">
        <div className="text-white text-sm font-mono">{order.phoneNumber}</div>
        <div className="text-zinc-500 text-xs mt-0.5">{order.id.slice(0, 8)}…</div>
      </td>
      <td className="py-3 px-4">
        <div className="text-zinc-300 text-sm">{order.userFullName}</div>
        <div className="text-zinc-500 text-xs">{order.userPhone}</div>
      </td>
      <td className="py-3 px-4 text-zinc-300 text-sm">{order.serviceName}</td>
      <td className="py-3 px-4">
        <span className="text-sm">{order.countryFlag}</span>
        <span className="text-zinc-300 text-sm ml-1">{order.countryName}</span>
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[order.status] ?? "bg-zinc-700 text-zinc-400"}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </td>
      <td className="py-3 px-4 text-white text-sm font-semibold">{formatFCFA(order.price)}</td>
      <td className="py-3 px-4 text-zinc-400 text-xs">
        <div>{new Date(order.createdAt).toLocaleDateString("fr-FR")}</div>
        <div className={isExpired ? "text-red-400" : "text-zinc-500"}>{expiresAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
      </td>
      <td className="py-3 px-4">
        {order.status === "waiting" && (
          <button
            onClick={() => { if (confirm("Annuler et rembourser cette commande ?")) cancel.mutate(); }}
            disabled={cancel.isPending}
            className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
            title="Annuler et rembourser"
          >
            {cancel.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
          </button>
        )}
      </td>
    </tr>
  );
}

function OrdersContent() {
  const [page, setPage] = useState(0);
  const PER_PAGE = 30;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", page],
    queryFn: () => adminApi.getOrders({ limit: PER_PAGE, offset: page * PER_PAGE }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PER_PAGE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Commandes</h1>
        <p className="text-zinc-400 text-sm mt-1">{data?.total ?? 0} commandes au total</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Numéro", "Utilisateur", "Service", "Pays", "Statut", "Prix", "Date", ""].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="py-16 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
              ) : data?.orders.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-zinc-500">Aucune commande</td></tr>
              ) : (
                data?.orders.map(order => <OrderRow key={order.id} order={order} />)
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

export default function AdminOrders() {
  return (
    <AdminGuard>
      <AdminLayout>
        <OrdersContent />
      </AdminLayout>
    </AdminGuard>
  );
}
