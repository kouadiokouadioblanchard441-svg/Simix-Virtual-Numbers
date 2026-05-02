import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminUser } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, Search, UserX, UserCheck, ShieldCheck, Coins, Trash2, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  Standard: "bg-emerald-500/20 text-emerald-400",
  Premium: "bg-violet-500/20 text-violet-400",
  Bloqué: "bg-red-500/20 text-red-400",
};

function UserRow({ user, onAction }: { user: AdminUser; onAction: () => void }) {
  const [open, setOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("Activité suspecte");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceReason, setBalanceReason] = useState("Ajustement manuel");
  const { toast } = useToast();
  const qc = useQueryClient();

  const block = useMutation({ mutationFn: () => adminApi.blockUser(user.id, blockReason), onSuccess: () => { toast({ title: "Utilisateur bloqué" }); qc.invalidateQueries({ queryKey: ["admin-users"] }); setOpen(false); } });
  const unblock = useMutation({ mutationFn: () => adminApi.unblockUser(user.id), onSuccess: () => { toast({ title: "Utilisateur débloqué" }); qc.invalidateQueries({ queryKey: ["admin-users"] }); } });
  const adjust = useMutation({ mutationFn: () => adminApi.adjustBalance(user.id, Number(balanceAmount), balanceReason), onSuccess: () => { toast({ title: "Solde ajusté" }); qc.invalidateQueries({ queryKey: ["admin-users"] }); setBalanceAmount(""); } });
  const del = useMutation({ mutationFn: () => adminApi.deleteUser(user.id), onSuccess: () => { toast({ title: "Utilisateur supprimé" }); qc.invalidateQueries({ queryKey: ["admin-users"] }); onAction(); } });
  const promote = useMutation({ mutationFn: () => adminApi.promoteUser(user.id), onSuccess: () => { toast({ title: "Rôle admin accordé" }); qc.invalidateQueries({ queryKey: ["admin-users"] }); } });
  const demote = useMutation({ mutationFn: () => adminApi.demoteUser(user.id), onSuccess: () => { toast({ title: "Rôle admin retiré" }); qc.invalidateQueries({ queryKey: ["admin-users"] }); } });

  const riskColor = user.riskScore > 60 ? "text-red-400" : user.riskScore > 30 ? "text-yellow-400" : "text-emerald-400";

  return (
    <>
      <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
        <td className="py-3 px-4">
          <div className="font-medium text-white text-sm">{user.fullName}</div>
          <div className="text-zinc-500 text-xs">{user.email}</div>
        </td>
        <td className="py-3 px-4 text-zinc-300 text-sm">{user.phone}</td>
        <td className="py-3 px-4 text-sm font-semibold text-white">{formatFCFA(user.balance)}</td>
        <td className="py-3 px-4">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[user.status] ?? "bg-zinc-700 text-zinc-300"}`}>{user.status}</span>
        </td>
        <td className={`py-3 px-4 text-sm font-bold ${riskColor}`}>{user.riskScore}</td>
        <td className="py-3 px-4 text-zinc-400 text-xs">{new Date(user.createdAt).toLocaleDateString("fr-FR")}</td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1.5">
            <a href={`/admin/users/${user.id}`} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"><Eye className="w-3.5 h-3.5" /></a>
            {user.status === "Bloqué"
              ? <button onClick={() => unblock.mutate()} disabled={unblock.isPending} className="p-1.5 rounded hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 transition-colors"><UserCheck className="w-3.5 h-3.5" /></button>
              : <button onClick={() => setOpen(!open)} className="p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"><UserX className="w-3.5 h-3.5" /></button>
            }
            {user.isAdmin
              ? <button onClick={() => demote.mutate()} disabled={demote.isPending} className="p-1.5 rounded hover:bg-violet-500/20 text-violet-400 transition-colors" title="Retirer admin"><ShieldCheck className="w-3.5 h-3.5" /></button>
              : <button onClick={() => promote.mutate()} disabled={promote.isPending} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-violet-400 transition-colors" title="Promouvoir admin"><ShieldCheck className="w-3.5 h-3.5" /></button>
            }
            <button onClick={() => { if (confirm(`Supprimer ${user.fullName} ?`)) del.mutate(); }} disabled={del.isPending} className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>

      {open && (
        <tr className="bg-zinc-900/50">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <div className="space-y-2">
                <div className="text-xs text-zinc-400 font-medium">Bloquer l'utilisateur</div>
                <input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Raison du blocage" className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500" />
                <button onClick={() => block.mutate()} disabled={block.isPending} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50">
                  {block.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer le blocage"}
                </button>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-zinc-400 font-medium">Ajuster le solde (FCFA)</div>
                <input type="number" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)} placeholder="Ex: 5000 ou -2000" className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500" />
                <input value={balanceReason} onChange={e => setBalanceReason(e.target.value)} placeholder="Raison" className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500" />
                <button onClick={() => adjust.mutate()} disabled={adjust.isPending || !balanceAmount} className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50">
                  {adjust.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Coins className="w-3.5 h-3.5 inline mr-1" />Appliquer</>}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UsersContent() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const PER_PAGE = 20;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", debouncedSearch, page],
    queryFn: () => adminApi.getUsers({ limit: PER_PAGE, offset: page * PER_PAGE, search: debouncedSearch || undefined }),
  });

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as unknown as Record<string, ReturnType<typeof setTimeout>>)._searchTimer);
    (window as unknown as Record<string, ReturnType<typeof setTimeout>>)._searchTimer = setTimeout(() => { setDebouncedSearch(val); setPage(0); }, 300);
  };

  const totalPages = Math.ceil((data?.total ?? 0) / PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
          <p className="text-zinc-400 text-sm mt-1">{data?.total ?? 0} utilisateurs enregistrés</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Rechercher par nom, email, téléphone..."
            className="pl-9 pr-4 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 w-full sm:w-72"
          />
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Utilisateur</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Téléphone</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Solde</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Statut</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Risque</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Inscrit</th>
                <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
              ) : data?.users.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-zinc-500">Aucun utilisateur trouvé</td></tr>
              ) : (
                data?.users.map(user => <UserRow key={user.id} user={user} onAction={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />)
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

export default function AdminUsers() {
  return (
    <AdminGuard>
      <AdminLayout>
        <UsersContent />
      </AdminLayout>
    </AdminGuard>
  );
}
