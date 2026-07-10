import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type ReferralWithdrawal } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import {
  Loader2, Gift, CheckCircle2, XCircle, Clock, RefreshCw,
  Smartphone, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "pending", label: "En attente" },
  { value: "paid", label: "Payés" },
  { value: "rejected", label: "Rejetés" },
  { value: "", label: "Tous" },
];

function StatusBadge({ status }: { status: ReferralWithdrawal["status"] }) {
  if (status === "pending") return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <Clock className="w-3 h-3" /> En attente
    </span>
  );
  if (status === "paid") return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-3 h-3" /> Payé
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
      <XCircle className="w-3 h-3" /> Rejeté
    </span>
  );
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h}h`;
  return `Il y a ${Math.floor(h / 24)}j`;
}

function WithdrawalRow({ w, onDone }: { w: ReferralWithdrawal; onDone: () => void }) {
  const { toast } = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const approve = useMutation({
    mutationFn: () => adminApi.approveReferralWithdrawal(w.id),
    onSuccess: () => { toast({ title: "Retrait approuvé", description: `${formatFCFA(w.amount)} marqués comme payés` }); onDone(); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: () => adminApi.rejectReferralWithdrawal(w.id, reason || undefined),
    onSuccess: () => { toast({ title: "Retrait rejeté", description: "Le solde a été recrédité à l'utilisateur" }); onDone(); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white text-sm font-semibold">{w.userName ?? "Utilisateur"}</span>
              <StatusBadge status={w.status} />
            </div>
            <div className="text-zinc-500 text-xs mt-0.5">{w.userPhone ?? w.userEmail ?? w.userId.slice(0, 8)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-amber-400 font-bold">{formatFCFA(w.amount)}</div>
          <div className="text-zinc-600 text-[10px]">{relativeDate(w.createdAt)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-950/60 rounded-lg px-3 py-2">
        <Smartphone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span>{w.countryFlag} {w.countryName ?? w.countryCode}</span>
        <span className="text-zinc-700">·</span>
        <span style={{ color: w.operatorColor ?? undefined }}>{w.operatorName ?? w.operatorSlug}</span>
        <span className="text-zinc-700">·</span>
        <span className="font-mono">{w.phone}</span>
      </div>

      {w.status === "rejected" && w.adminNote && (
        <div className="text-xs text-red-400/80 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Motif : {w.adminNote}
        </div>
      )}

      {w.status === "pending" && (
        <div className="space-y-2">
          {rejecting && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motif du rejet (optionnel)"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => approve.mutate()}
              disabled={approve.isPending || reject.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {approve.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Approuver (payé)
            </button>
            {!rejecting ? (
              <button
                onClick={() => setRejecting(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Rejeter
              </button>
            ) : (
              <button
                onClick={() => reject.mutate()}
                disabled={reject.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {reject.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                Confirmer le rejet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReferralWithdrawalsContent() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-referral-withdrawals", tab],
    queryFn: () => adminApi.getReferralWithdrawals(tab || undefined),
    refetchInterval: 60_000,
  });

  const list = data?.withdrawals ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-referral-withdrawals"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center shadow-lg">
              <Gift className="w-5 h-5 text-white" />
            </div>
            Retraits de parrainage
            {!!data?.pendingCount && (
              <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold">{data.pendingCount} en attente</span>
            )}
          </h1>
          <p className="text-zinc-400 text-sm mt-1.5">
            Demandes de retrait du solde de parrainage — validez pour confirmer le paiement mobile money
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl border border-zinc-700 transition-colors self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.value ? "bg-amber-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-500">
          <Gift className="w-10 h-10 opacity-40" />
          <p>Aucune demande de retrait dans cette catégorie.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map(w => <WithdrawalRow key={w.id} w={w} onDone={refresh} />)}
        </div>
      )}
    </div>
  );
}

export default function AdminReferralWithdrawals() {
  return (
    <AdminGuard>
      <AdminLayout>
        <ReferralWithdrawalsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
