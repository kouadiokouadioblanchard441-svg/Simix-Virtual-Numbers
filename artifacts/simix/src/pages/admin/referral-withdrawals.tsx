import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminPayoutRecord, type ReferralWithdrawal } from "@/lib/admin-api";
import { beginPayoutAttempt, getPayoutAttempt, updatePayoutAttempt, type PayoutAttempt } from "@/lib/payout-attempts";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import {
  AlertTriangle, CheckCircle2, Clock, Gift, Loader2, RefreshCw,
  Smartphone, XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Gateway = "pawapay" | "clapay";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "pending", label: "En attente" },
  { value: "paid", label: "Payés" },
  { value: "rejected", label: "Rejetés" },
  { value: "", label: "Tous" },
];

function StatusBadge({ status }: { status: ReferralWithdrawal["status"] }) {
  if (status === "pending") return (
    <span data-testid="status-referral-pending" className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <Clock className="w-3 h-3" /> En attente
    </span>
  );
  if (status === "paid") return (
    <span data-testid="status-referral-paid" className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-3 h-3" /> Payé
    </span>
  );
  return (
    <span data-testid="status-referral-rejected" className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
      <XCircle className="w-3 h-3" /> Rejeté
    </span>
  );
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${Math.floor(hours / 24)}j`;
}

function payoutStatusText(payout: AdminPayoutRecord) {
  if (payout.status === "completed") return "Paiement confirmé";
  if (payout.status === "failed") return `Paiement échoué${payout.failureReason ? ` : ${payout.failureReason}` : ""}`;
  return "Paiement en traitement";
}

function WithdrawalRow({ w, onDone }: { w: ReferralWithdrawal; onDone: () => void }) {
  const { toast } = useToast();
  const [gateway, setGateway] = useState<Gateway>("pawapay");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [operatorOtp, setOperatorOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [localPayout, setLocalPayout] = useState<AdminPayoutRecord | null>(null);
  const [sending, setSending] = useState(false);
  const [attempt, setAttempt] = useState<PayoutAttempt | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [sendError, setSendError] = useState("");
  const queryClient = useQueryClient();
  const clapayOperators = useQuery({
    queryKey: ["admin-referral-clapay-operators", w.countryCode],
    queryFn: () => adminApi.getClapayPayoutOperators(w.countryCode),
    enabled: gateway === "clapay" && !!w.countryCode,
    retry: 0,
  });
  const clapayOperator = clapayOperators.data?.operators.find((operator) =>
    operator.codeoperator === w.operatorSlug || operator.payoutCode === w.operatorSlug
      || operator.code?.CASHIN === w.operatorSlug || operator.cashoutCode === w.operatorSlug,
  );
  const needsOtp = otpRequested || !!clapayOperator?.requiresOtp;
  // A terminal server result must supersede the pending response from send,
  // including while the row stays mounted in the "Tous" filter.
  const linkedPayout = w.payout && w.payout.status !== "pending"
    ? w.payout : localPayout ?? w.payout ?? null;
  const payoutInProgress = w.status === "pending" && (linkedPayout
    ? linkedPayout.status === "pending"
    : !!w.payoutInProgress || attempt?.status === "pending");
  const sendable = w.status === "pending" && !payoutInProgress && !linkedPayout;
  const attemptPayload = { withdrawalId: w.id, gateway };

  useEffect(() => {
    let current = true;
    setAttemptLoading(true);
    void getPayoutAttempt(`referral:${w.id}:${gateway}`, attemptPayload)
      .then((value) => { if (current) setAttempt(value); })
      .catch(() => { if (current) setAttempt(null); })
      .finally(() => { if (current) setAttemptLoading(false); });
    return () => { current = false; };
  }, [w.id, gateway]);

  const reject = useMutation({
    mutationFn: () => adminApi.rejectReferralWithdrawal(w.id, reason || undefined),
    onSuccess: () => { toast({ title: "Retrait rejeté", description: "Le solde a été recrédité à l'utilisateur" }); onDone(); },
    onError: (error) => toast({ title: "Erreur", description: (error as Error).message, variant: "destructive" }),
  });

  const sendPayout = async () => {
    if (!sendable || sending || attemptLoading || (gateway === "clapay" && needsOtp && !operatorOtp.trim())) return;
    setSending(true);
    setSendError("");
    try {
      const existing = await getPayoutAttempt(`referral:${w.id}:${gateway}`, attemptPayload);
      if (existing?.status === "pending") {
        setSendError("Ce paiement est déjà en traitement. Actualisez la liste avant toute nouvelle action.");
        return;
      }
      const currentAttempt = await beginPayoutAttempt(`referral:${w.id}:${gateway}`, attemptPayload);
      setAttempt(currentAttempt);
      setLocalPayout(null);
      const payout = await adminApi.sendReferralWithdrawal(w.id, {
        gateway,
        idempotencyKey: currentAttempt.idempotencyKey,
        ...(gateway === "clapay" && needsOtp ? { operatorOtp: operatorOtp.trim() } : {}),
      });
      setLocalPayout(payout);
      await updatePayoutAttempt(`referral:${w.id}:${gateway}`, attemptPayload, {
        status: payout.status,
        recordId: payout.id,
      });
      setAttempt({ ...currentAttempt, status: payout.status, recordId: payout.id });
      setOperatorOtp("");
      setOtpRequested(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-referral-withdrawals"] });
      toast({
        title: payout.status === "completed" ? "Paiement confirmé" : payout.status === "failed" ? "Paiement échoué" : "Paiement en traitement",
        description: payoutStatusText(payout),
      });
    } catch (caught) {
      const error = caught as Error & { status?: number; requiresOtp?: boolean };
      setSendError(error.message);
      if (error.requiresOtp) setOtpRequested(true);
      const retryWithSameKey = !!error.requiresOtp || (error.status !== 400 && error.status !== 422);
      await updatePayoutAttempt(`referral:${w.id}:${gateway}`, attemptPayload, {
        status: retryWithSameKey ? "unknown" : "failed",
      }).catch(() => undefined);
      setAttempt((current) => current ? { ...current, status: retryWithSameKey ? "unknown" : "failed" } : current);
      toast({ title: "Erreur de paiement", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid={`referral-withdrawal-${w.id}`} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0"><Gift className="w-4 h-4 text-amber-400" /></div>
          <div>
            <div className="flex items-center gap-2 flex-wrap"><span className="text-white text-sm font-semibold">{w.userName ?? "Utilisateur"}</span><StatusBadge status={w.status} /></div>
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
        <span>{w.countryFlag} {w.countryName ?? w.countryCode}</span><span className="text-zinc-700">·</span>
        <span style={{ color: w.operatorColor ?? undefined }}>{w.operatorName ?? w.operatorSlug}</span><span className="text-zinc-700">·</span>
        <span className="font-mono">{w.phone}</span>
      </div>

      {w.status === "rejected" && w.adminNote && <div className="text-xs text-red-400/80 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Motif : {w.adminNote}</div>}

      {(linkedPayout || payoutInProgress) && (
        <div data-testid={`referral-payout-status-${w.id}`} className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
          linkedPayout?.status === "completed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : linkedPayout?.status === "failed" ? "border-red-500/20 bg-red-500/10 text-red-300"
              : "border-amber-500/20 bg-amber-500/10 text-amber-300"
        }`}>
          {linkedPayout?.status === "completed" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : linkedPayout?.status === "failed" ? <XCircle className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
          <span>{linkedPayout ? payoutStatusText(linkedPayout) : "Paiement en traitement"}</span>
        </div>
      )}

      {w.status === "pending" && (
        <div className="space-y-2">
          {sendable && (
            <>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Passerelle de paiement</label>
              <select
                data-testid={`referral-gateway-${w.id}`}
                value={gateway}
                onChange={(event) => { setGateway(event.target.value as Gateway); setOperatorOtp(""); setOtpRequested(false); setLocalPayout(null); setSendError(""); }}
                disabled={payoutInProgress}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="pawapay">PawaPay</option><option value="clapay">Clapay</option>
              </select>
              {gateway === "clapay" && needsOtp && (
                <div>
                  <label htmlFor={`referral-otp-${w.id}`} className="block text-xs font-semibold text-zinc-400 mb-1">Code OTP opérateur (pas le PIN)</label>
                  <input
                    id={`referral-otp-${w.id}`}
                    data-testid={`referral-otp-${w.id}`}
                    value={operatorOtp}
                    onChange={(event) => setOperatorOtp(event.target.value)}
                    placeholder="Code OTP"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                  />
                </div>
              )}
              {gateway === "clapay" && clapayOperators.isLoading && <p className="text-xs text-zinc-500">Vérification des exigences OTP Clapay…</p>}
              {gateway === "clapay" && clapayOperators.isError && <p className="text-xs text-amber-300">Les exigences OTP ne sont pas disponibles. L’API indiquera si un OTP est nécessaire.</p>}
              {sendError && <p role="alert" data-testid={`referral-send-error-${w.id}`} className="text-xs text-red-300">{sendError}</p>}
              {attempt?.status === "unknown" && <p className="text-xs text-amber-300">Résultat incertain : la reprise utilise la même clé idempotente.</p>}
              <button
                data-testid={`referral-send-${w.id}`}
                onClick={sendPayout}
                disabled={sending || attemptLoading || payoutInProgress || (gateway === "clapay" && needsOtp && !operatorOtp.trim())}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {sending || attemptLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : attempt?.status === "unknown" ? <RefreshCw className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                {sending ? "Envoi en cours…" : attempt?.status === "unknown" ? "Reprendre avec la même clé" : `Envoyer via ${gateway === "pawapay" ? "PawaPay" : "Clapay"}`}
              </button>
            </>
          )}
          {payoutInProgress && <p className="text-xs text-amber-300">Paiement en traitement — l’envoi et le rejet sont désactivés.</p>}
          {rejecting && !payoutInProgress && (
            <input data-testid={`referral-reject-reason-${w.id}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif du rejet (optionnel)" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600" />
          )}
          <div className="flex gap-2">
            {!rejecting ? (
              <button data-testid={`referral-reject-${w.id}`} onClick={() => setRejecting(true)} disabled={payoutInProgress} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors disabled:opacity-50">
                <XCircle className="w-3.5 h-3.5" /> Rejeter
              </button>
            ) : (
              <button data-testid={`referral-reject-confirm-${w.id}`} onClick={() => reject.mutate()} disabled={reject.isPending || payoutInProgress} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors disabled:opacity-50">
                {reject.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Confirmer le rejet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReferralWithdrawalsContent() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("pending");
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-referral-withdrawals", tab],
    queryFn: () => adminApi.getReferralWithdrawals(tab || undefined),
    refetchInterval: () => document.visibilityState === "visible" ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const list = data?.withdrawals ?? [];
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["admin-referral-withdrawals"] }); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center shadow-lg"><Gift className="w-5 h-5 text-white" /></span>
            Retraits de parrainage
            {!!data?.pendingCount && <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold">{data.pendingCount} en attente</span>}
          </h1>
          <p className="text-zinc-400 text-sm mt-1.5">Envoyez réellement les demandes de retrait et suivez leur statut opérateur.</p>
        </div>
        <button data-testid="referral-refresh" onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl border border-zinc-700 transition-colors self-start">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((item) => (
          <button key={item.value} data-testid={`referral-tab-${item.value || "all"}`} onClick={() => setTab(item.value)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === item.value ? "bg-amber-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800"}`}>
            {item.label}
          </button>
        ))}
      </div>
      {isLoading ? <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 text-amber-500 animate-spin" /></div>
        : list.length === 0 ? <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-500"><Gift className="w-10 h-10 opacity-40" /><p>Aucune demande de retrait dans cette catégorie.</p></div>
          : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{list.map((withdrawal) => <WithdrawalRow key={withdrawal.id} w={withdrawal} onDone={refresh} />)}</div>}
    </div>
  );
}

export default function AdminReferralWithdrawals() {
  return <AdminGuard><AdminLayout><ReferralWithdrawalsContent /></AdminLayout></AdminGuard>;
}