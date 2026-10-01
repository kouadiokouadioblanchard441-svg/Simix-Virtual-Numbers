import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { motion } from "framer-motion";
import { Clock, ExternalLink, Loader2, AlertCircle, Copy, CheckCircle2 } from "lucide-react";
import { formatFCFA } from "@/lib/format";
import {
  cancelDeposit, CancelError, clearPendingDeposit, fetchDepositStatus, loadPendingDeposit,
  savePendingDeposit, toDirectAction, type DirectAction,
} from "@/lib/clapay-direct";

interface Props {
  depositId: string;
  localAmount: number;
  currencyCode: string;
  methodName: string;
  methodColor: string;
  paymentUrl: string | null; // legacy hosted checkout (already initiated)
  initialAction: DirectAction;
  ambiguous?: boolean; // 502 recovery
  hidden?: boolean;
  onSuccess: () => void;
  onFailed: () => void;
  onCancelled: () => void;
  onHide: () => void;
}

const DELAY_NOTICE_S = 120;

export function WalletPendingOverlay(p: Props) {
  const [dots, setDots] = useState(".");
  const [elapsed, setElapsed] = useState(0);
  const [action, setAction] = useState<DirectAction>(p.initialAction);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [operatorQr, setOperatorQr] = useState<string | null>(null);
  const cbs = useRef(p);
  cbs.current = p;

  useEffect(() => {
    let active = true;
    setOperatorQr(null);
    if (action.operatorPaymentUrl) {
      QRCode.toDataURL(action.operatorPaymentUrl, { width: 220, margin: 2, errorCorrectionLevel: "M" })
        .then(url => { if (active) setOperatorQr(url); })
        .catch(() => { /* The operator link remains available if QR rendering fails. */ });
    }
    return () => { active = false; };
  }, [action.operatorPaymentUrl]);

  useEffect(() => {
    const a = setInterval(() => setDots(d => (d.length >= 3 ? "." : d + ".")), 600);
    const b = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  useEffect(() => {
    let stopped = false;
    async function check() {
      try {
        const d = await fetchDepositStatus(p.depositId);
        if (stopped) return true;
        if (d.status === "completed") { clearPendingDeposit(); cbs.current.onSuccess(); return true; }
        if (d.status === "failed" || d.status === "cancelled" || d.status === "expired") {
          clearPendingDeposit(); cbs.current.onFailed(); return true;
        }
        const next = toDirectAction(d);
        if (next.operatorPaymentUrl || next.paymentOtp || next.message) {
          setAction(prev => {
            const merged = {
              operatorPaymentUrl: next.operatorPaymentUrl ?? prev.operatorPaymentUrl,
              paymentOtp: next.paymentOtp ?? prev.paymentOtp,
              message: next.message ?? prev.message,
            };
            const stored = loadPendingDeposit();
            if (stored && stored.depositId === p.depositId) savePendingDeposit({ ...stored, ...merged });
            return merged;
          });
        }
      } catch { /* transient: keep polling */ }
      return false;
    }
    (async () => {
      if (await check()) return;
      while (!stopped) {
        await new Promise(r => setTimeout(r, 4000));
        if (stopped) break;
        if (await check()) return;
      }
    })();
    return () => { stopped = true; };
  }, [p.depositId]);

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const outcome = await cancelDeposit(p.depositId);
      clearPendingDeposit();
      if (outcome === "completed") p.onSuccess();
      else p.onCancelled();
    } catch (e) {
      const ce = e as CancelError;
      if (ce.completed) { clearPendingDeposit(); p.onSuccess(); return; }
      // Race check: payment may have completed meanwhile
      try {
        const d = await fetchDepositStatus(p.depositId);
        if (d.status === "completed") { clearPendingDeposit(); p.onSuccess(); return; }
      } catch { /* ignore */ }
      setCancelError(ce.message || "Annulation impossible. Le paiement reste en attente.");
    } finally {
      setCancelling(false);
    }
  }

  async function copyOtp() {
    if (!action.paymentOtp) return;
    try { await navigator.clipboard.writeText(action.paymentOtp); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  const amountStr = p.currencyCode === "XOF" || p.currencyCode === "XAF"
    ? formatFCFA(p.localAmount)
    : `${p.localAmount.toLocaleString("fr-FR")} ${p.currencyCode}`;
  const minutes = Math.floor(elapsed / 60);
  const timeStr = minutes > 0 ? `${minutes}m ${elapsed % 60}s` : `${elapsed}s`;
  const legacyUrl = p.paymentUrl;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.95)", display: p.hidden ? "none" : undefined }}
      data-testid="overlay-pending-deposit"
    >
      <div className="min-h-full flex items-center justify-center px-6 py-8">
        <div className="text-center w-full max-w-xs">
          <div className="relative w-20 h-20 mx-auto mb-5">
            <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center"
              style={{ borderColor: `${p.methodColor}40`, backgroundColor: `${p.methodColor}15` }}>
              <Clock className="w-8 h-8" style={{ color: p.methodColor }} />
            </div>
            <motion.div className="absolute inset-0 rounded-full border-4 border-transparent"
              style={{ borderTopColor: p.methodColor }}
              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }} />
          </div>

          <p className="text-xl font-black text-white mb-2" data-testid="text-pending-title">En attente de validation{dots}</p>
          <p className="text-sm text-muted-foreground">
            Paiement de <span className="font-bold text-white">{amountStr}</span>
          </p>
          <p className="text-sm font-medium mt-1" style={{ color: p.methodColor }}>{p.methodName}</p>
          <p className="text-xs text-muted-foreground/50 mt-2">Temps écoulé : {timeStr}</p>

          {p.ambiguous && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-left text-xs text-amber-300" data-testid="text-pending-ambiguous">
              L'initiation du paiement n'a pas pu être confirmée. Une demande peut avoir été envoyée : vérifiez votre téléphone, votre solde sera crédité automatiquement si elle aboutit.
            </div>
          )}

          {action.message && (
            <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-2xl text-left" data-testid="text-pending-message">
              <p className="text-sm text-white/90 whitespace-pre-line break-words">{action.message}</p>
            </div>
          )}

          {action.paymentOtp && (
            <div className="mt-4 p-4 bg-white/5 border rounded-2xl" style={{ borderColor: `${p.methodColor}60` }}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Code d'achat à saisir</p>
              <p className="text-2xl font-black text-white tracking-widest font-mono break-all select-all" data-testid="text-payment-otp">{action.paymentOtp}</p>
              <button type="button" onClick={copyOtp} data-testid="button-copy-otp"
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white">
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
          )}

          {action.operatorPaymentUrl && (
            <>
            {operatorQr && (
              <div className="mt-4">
                <img src={operatorQr} alt={`QR code du paiement ${p.methodName}`} width={220} height={220}
                  data-testid="image-operator-qr" className="mx-auto rounded-xl" />
                <p className="mt-2 text-xs text-muted-foreground">Scannez avec votre téléphone ou ouvrez l'application ci-dessous.</p>
              </div>
            )}
            <a href={action.operatorPaymentUrl} target="_blank" rel="noopener noreferrer"
              data-testid="link-operator-payment"
              className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90"
              style={{ backgroundColor: p.methodColor }}>
              <ExternalLink className="w-4 h-4" /> Ouvrir l'application {p.methodName}
            </a>
            </>
          )}

          {legacyUrl && (
            <a href={legacyUrl} data-testid="link-legacy-checkout"
              className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90"
              style={{ backgroundColor: p.methodColor }}>
              Ouvrir la page de paiement
            </a>
          )}

          <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-2xl text-left">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Pendant ce temps</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• Validez la demande sur votre téléphone</li>
              <li>• Votre solde sera crédité automatiquement</li>
              <li>• Fermer cette fenêtre n'annule pas le paiement</li>
            </ul>
          </div>

          {elapsed >= DELAY_NOTICE_S && (
            <p className="mt-3 text-xs text-amber-300" data-testid="text-pending-delayed">
              Toujours en attente de la confirmation de l'opérateur. Ce n'est pas un échec : la confirmation peut prendre quelques minutes.
            </p>
          )}

          {cancelError && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-left text-xs text-rose-300" data-testid="text-cancel-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> <span className="break-words">{cancelError}</span>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={handleCancel} disabled={cancelling} data-testid="button-cancel-deposit"
              className="w-full py-2.5 rounded-2xl border border-rose-500/40 text-rose-300 text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {cancelling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Annuler ce paiement
            </button>
            <button type="button" onClick={p.onHide} data-testid="button-hide-pending"
              className="text-xs text-muted-foreground/70 underline underline-offset-2 py-1">
              Masquer (le paiement reste en attente)
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
