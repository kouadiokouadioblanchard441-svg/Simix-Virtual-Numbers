import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminUser } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import {
  Loader2, Search, UserX, UserCheck, ShieldCheck, Coins, Trash2,
  ChevronLeft, ChevronRight, Eye, KeyRound, LogOut, Gauge, Copy,
  CheckCircle2, AlertTriangle, Lock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  Standard: "bg-emerald-500/20 text-emerald-400",
  Premium: "bg-violet-500/20 text-violet-400",
  Bloqué: "bg-red-500/20 text-red-400",
};

type Panel = "block" | "balance" | "limits" | "reset" | null;

function UserRow({ user, onAction }: { user: AdminUser; onAction: () => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [blockReason, setBlockReason] = useState("Activité suspecte");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceReason, setBalanceReason] = useState("Ajustement manuel");
  const [maxPurchases, setMaxPurchases] = useState(String(user.maxPurchasesPerMin ?? 10));
  const [maxBal, setMaxBal] = useState(String(user.maxBalance ?? 500000));
  const [restricted, setRestricted] = useState(user.isRestricted ?? false);
  const [newPwd, setNewPwd] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const togglePanel = (p: Panel) => setPanel(prev => prev === p ? null : p);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const block = useMutation({ mutationFn: () => adminApi.blockUser(user.id, blockReason), onSuccess: () => { toast({ title: "Utilisateur bloqué" }); invalidate(); togglePanel(null); } });
  const unblock = useMutation({ mutationFn: () => adminApi.unblockUser(user.id), onSuccess: () => { toast({ title: "Utilisateur débloqué" }); invalidate(); } });
  const adjust = useMutation({ mutationFn: () => adminApi.adjustBalance(user.id, Number(balanceAmount), balanceReason), onSuccess: () => { toast({ title: "Solde ajusté" }); invalidate(); setBalanceAmount(""); } });
  const setLimits = useMutation({
    mutationFn: () => adminApi.setLimits(user.id, { maxPurchasesPerMin: Number(maxPurchases), maxBalance: Number(maxBal), isRestricted: restricted }),
    onSuccess: () => { toast({ title: "Limites mises à jour" }); invalidate(); togglePanel(null); },
  });
  const resetPwd = useMutation({
    mutationFn: () => adminApi.resetPassword(user.id),
    onSuccess: (data) => { setNewPwd(data.newPassword); toast({ title: "Mot de passe réinitialisé" }); invalidate(); },
  });
  const forceLogout = useMutation({
    mutationFn: () => adminApi.forceLogout(user.id),
    onSuccess: (data) => { toast({ title: data.message }); invalidate(); },
  });
  const del = useMutation({ mutationFn: () => adminApi.deleteUser(user.id), onSuccess: () => { toast({ title: "Utilisateur supprimé" }); onAction(); } });
  const promote = useMutation({ mutationFn: () => adminApi.promoteUser(user.id), onSuccess: () => { toast({ title: "Rôle admin accordé" }); invalidate(); } });
  const demote = useMutation({ mutationFn: () => adminApi.demoteUser(user.id), onSuccess: () => { toast({ title: "Rôle admin retiré" }); invalidate(); } });

  const riskColor = user.riskScore > 60 ? "text-red-400" : user.riskScore > 30 ? "text-yellow-400" : "text-emerald-400";
  const isExpanded = panel !== null || newPwd !== null;

  return (
    <>
      <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
        <td className="py-3 px-4">
          <div className="font-medium text-white text-sm">{user.fullName}</div>
          <div className="text-zinc-500 text-xs">{user.username ? `@${user.username}` : user.email}</div>
        </td>
        <td className="py-3 px-4 text-zinc-300 text-sm">{user.phone}</td>
        <td className="py-3 px-4 text-sm font-semibold text-white">{formatFCFA(user.balance)}</td>
        <td className="py-3 px-4">
          <div className="flex flex-col gap-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${STATUS_COLORS[user.status] ?? "bg-zinc-700 text-zinc-300"}`}>{user.status}</span>
            {user.isRestricted && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-medium w-fit flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" />Limité</span>}
          </div>
        </td>
        <td className={`py-3 px-4 text-sm font-bold ${riskColor}`}>{user.riskScore}</td>
        <td className="py-3 px-4 text-zinc-400 text-xs">{new Date(user.createdAt).toLocaleDateString("fr-FR")}</td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            <a href={`/admin/users/${user.id}`} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" title="Voir profil"><Eye className="w-3.5 h-3.5" /></a>
            {user.status === "Bloqué"
              ? <button onClick={() => unblock.mutate()} disabled={unblock.isPending} className="p-1.5 rounded hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 transition-colors" title="Débloquer"><UserCheck className="w-3.5 h-3.5" /></button>
              : <button onClick={() => togglePanel("block")} className="p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors" title="Bloquer"><UserX className="w-3.5 h-3.5" /></button>
            }
            <button onClick={() => togglePanel("balance")} className="p-1.5 rounded hover:bg-violet-500/20 text-zinc-400 hover:text-violet-400 transition-colors" title="Ajuster solde"><Coins className="w-3.5 h-3.5" /></button>
            <button onClick={() => togglePanel("limits")} className={`p-1.5 rounded hover:bg-amber-500/20 transition-colors ${panel === "limits" ? "text-amber-400 bg-amber-500/10" : "text-zinc-400 hover:text-amber-400"}`} title="Limites"><Gauge className="w-3.5 h-3.5" /></button>
            <button onClick={() => togglePanel("reset")} className={`p-1.5 rounded hover:bg-blue-500/20 transition-colors ${panel === "reset" ? "text-blue-400 bg-blue-500/10" : "text-zinc-400 hover:text-blue-400"}`} title="Réinitialiser mot de passe"><KeyRound className="w-3.5 h-3.5" /></button>
            <button onClick={() => { if (confirm(`Déconnecter ${user.fullName} ?`)) forceLogout.mutate(); }} disabled={forceLogout.isPending} className="p-1.5 rounded hover:bg-orange-500/20 text-zinc-400 hover:text-orange-400 transition-colors" title="Force logout"><LogOut className="w-3.5 h-3.5" /></button>
            {user.isAdmin
              ? <button onClick={() => demote.mutate()} disabled={demote.isPending} className="p-1.5 rounded hover:bg-violet-500/20 text-violet-400 transition-colors" title="Retirer admin"><ShieldCheck className="w-3.5 h-3.5" /></button>
              : <button onClick={() => promote.mutate()} disabled={promote.isPending} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-violet-400 transition-colors" title="Promouvoir admin"><ShieldCheck className="w-3.5 h-3.5" /></button>
            }
            <button onClick={() => { if (confirm(`Supprimer définitivement ${user.fullName} ?`)) del.mutate(); }} disabled={del.isPending} className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-zinc-950/60 border-b border-zinc-800">
          <td colSpan={7} className="px-4 py-4">
            <div className="max-w-3xl space-y-4">

              {/* Block Panel */}
              {panel === "block" && (
                <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-red-400 font-semibold text-sm"><AlertTriangle className="w-4 h-4" />Bloquer l'utilisateur</div>
                  <input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Raison du blocage" className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500" />
                  <div className="flex gap-2">
                    <button onClick={() => block.mutate()} disabled={block.isPending} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
                      {block.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}Confirmer le blocage
                    </button>
                    <button onClick={() => togglePanel(null)} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors">Annuler</button>
                  </div>
                </div>
              )}

              {/* Balance Panel */}
              {panel === "balance" && (
                <div className="bg-violet-950/30 border border-violet-900/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm"><Coins className="w-4 h-4" />Ajuster le solde</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)} placeholder="Montant (négatif pour déduire)" className="px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500" />
                    <input value={balanceReason} onChange={e => setBalanceReason(e.target.value)} placeholder="Raison" className="px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => adjust.mutate()} disabled={adjust.isPending || !balanceAmount} className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
                      {adjust.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}Appliquer
                    </button>
                    <button onClick={() => togglePanel(null)} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors">Annuler</button>
                  </div>
                </div>
              )}

              {/* Limits Panel */}
              {panel === "limits" && (
                <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm"><Gauge className="w-4 h-4" />Limites du compte</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 font-medium block mb-1">Achats max / min</label>
                      <input type="number" value={maxPurchases} onChange={e => setMaxPurchases(e.target.value)} min={1} className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 font-medium block mb-1">Solde max (FCFA)</label>
                      <input type="number" value={maxBal} onChange={e => setMaxBal(e.target.value)} min={0} className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 font-medium block mb-1">Compte restreint</label>
                      <button onClick={() => setRestricted(r => !r)} className={`w-full px-3 py-2 text-sm rounded-lg border transition-colors font-medium ${restricted ? "bg-orange-600/30 border-orange-600/50 text-orange-400" : "bg-zinc-900 border-zinc-700 text-zinc-400"}`}>
                        {restricted ? "Oui — restreint" : "Non — normal"}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setLimits.mutate()} disabled={setLimits.isPending} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
                      {setLimits.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Enregistrer les limites
                    </button>
                    <button onClick={() => togglePanel(null)} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors">Annuler</button>
                  </div>
                </div>
              )}

              {/* Reset Password Panel */}
              {panel === "reset" && !newPwd && (
                <div className="bg-blue-950/20 border border-blue-900/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm"><KeyRound className="w-4 h-4" />Réinitialiser le mot de passe</div>
                  <p className="text-zinc-400 text-xs">Un nouveau mot de passe aléatoire sera généré. Vous devrez le communiquer à l'utilisateur.</p>
                  <div className="flex gap-2">
                    <button onClick={() => resetPwd.mutate()} disabled={resetPwd.isPending} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
                      {resetPwd.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}Générer un nouveau mot de passe
                    </button>
                    <button onClick={() => togglePanel(null)} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors">Annuler</button>
                  </div>
                </div>
              )}

              {/* New Password Display */}
              {newPwd && (
                <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm"><CheckCircle2 className="w-4 h-4" />Nouveau mot de passe généré</div>
                  <div className="flex items-center gap-3 bg-zinc-900 rounded-lg px-4 py-3 border border-zinc-700">
                    <code className="text-white font-mono text-base flex-1 tracking-widest">{newPwd}</code>
                    <button onClick={() => { navigator.clipboard.writeText(newPwd); toast({ title: "Copié !" }); }} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-zinc-500 text-xs">⚠️ Communiquez ce mot de passe à l'utilisateur. Il ne sera plus affiché.</p>
                  <button onClick={() => { setNewPwd(null); togglePanel(null); }} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors">Fermer</button>
                </div>
              )}
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
          <h1 className="text-2xl font-bold text-white">Gestion des utilisateurs</h1>
          <p className="text-zinc-400 text-sm mt-1">{data?.total ?? 0} utilisateurs enregistrés</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Nom, email, téléphone, @username..."
            className="pl-9 pr-4 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 w-full sm:w-80"
          />
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Utilisateur</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Téléphone</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Solde</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Statut</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Risque</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Inscrit</th>
                <th className="py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-center">Actions</th>
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
            <span className="text-xs text-zinc-500">Page {page + 1} sur {totalPages} — {data?.total} utilisateurs</span>
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
