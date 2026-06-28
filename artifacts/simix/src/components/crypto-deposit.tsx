import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, CheckCircle2, Clock, Loader2, AlertCircle,
  ChevronDown, RefreshCw, Shield, Zap, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFCFA } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── Types ─── */
interface CryptoDepositResponse {
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payAmountFormatted: string;
  network: string;
  networkLabel: string;
  chain: string;
  amountFcfa: number;
  amountUsd: number;
  expiresAt: string;
  txId: string;
}

type DepositStatus = "idle" | "creating" | "waiting" | "processing" | "paid" | "failed" | "expired";

const NETWORKS = [
  {
    id: "trc20",
    label: "USDT · TRC-20",
    chain: "Tron",
    badge: "Sans frais",
    badgeColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    recommended: true,
    color: "#EF0027",
    chainLogo: "/crypto/tron.svg",
    desc: "Transfert rapide, frais quasi-nuls",
  },
  {
    id: "bep20",
    label: "USDT · BEP-20",
    chain: "BNB Smart Chain",
    badge: "Frais bas",
    badgeColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    recommended: false,
    color: "#F0B90B",
    chainLogo: "/crypto/bnb.svg",
    desc: "Réseau BNB, faibles frais",
  },
  {
    id: "erc20",
    label: "USDT · ERC-20",
    chain: "Ethereum",
    badge: "Frais élevés",
    badgeColor: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    recommended: false,
    color: "#627EEA",
    chainLogo: "/crypto/eth.svg",
    desc: "Réseau Ethereum standard",
  },
] as const;

type NetworkId = typeof NETWORKS[number]["id"];

/* ─── Quick amount presets ─── */
const PRESETS_FCFA = [1000, 2500, 5000, 10000, 25000, 50000];

/* ─── Countdown timer ─── */
function useCountdown(expiresAt: string | null) {
  const [secs, setSecs] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) { setSecs(0); return; }
    const update = () => setSecs(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);

  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return { secs, label: `${m}:${String(s).padStart(2, "0")}` };
}

/* ─── Copy to clipboard ─── */
function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);
  return { copied, copy };
}

/* ─── Crypto network icon: USDT logo + chain badge ─── */
function CryptoNetworkIcon({ net, size = 32 }: { net: typeof NETWORKS[number]; size?: number }) {
  const badgeSize = Math.round(size * 0.44);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <img
        src="/crypto/usdt.svg"
        alt="USDT"
        width={size}
        height={size}
        className="rounded-full"
        style={{ width: size, height: size }}
      />
      <img
        src={net.chainLogo}
        alt={net.chain}
        width={badgeSize}
        height={badgeSize}
        className="absolute -bottom-0.5 -right-0.5 rounded-full border border-card shadow-sm"
        style={{ width: badgeSize, height: badgeSize, backgroundColor: net.color }}
      />
    </div>
  );
}

/* ─── QR code using public API ─── */
function QRCode({ data, size = 180 }: { data: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=1a1a2e&color=ffffff&margin=10`;
  return (
    <div
      className="rounded-2xl overflow-hidden border-2 border-primary/20 shadow-lg shadow-primary/10 flex-shrink-0"
      style={{ width: size, height: size, background: "#1a1a2e" }}
    >
      <img src={url} alt="QR Code" width={size} height={size} className="block" />
    </div>
  );
}

/* ─── Status badge ─── */
function StatusBadge({ status }: { status: DepositStatus }) {
  const map: Record<DepositStatus, { label: string; color: string; icon: React.ReactNode }> = {
    idle:       { label: "En attente",      color: "text-muted-foreground bg-secondary border-card-border", icon: <Clock className="w-3.5 h-3.5" /> },
    creating:   { label: "Génération…",     color: "text-blue-400 bg-blue-500/10 border-blue-500/20",       icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    waiting:    { label: "En attente du paiement", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: <Clock className="w-3.5 h-3.5 animate-pulse" /> },
    processing: { label: "Confirmation…",   color: "text-blue-400 bg-blue-500/10 border-blue-500/20",       icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    paid:       { label: "Paiement reçu !", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    failed:     { label: "Échec",           color: "text-red-400 bg-red-500/10 border-red-500/20",           icon: <AlertCircle className="w-3.5 h-3.5" /> },
    expired:    { label: "Expiré",          color: "text-orange-400 bg-orange-500/10 border-orange-500/20", icon: <AlertCircle className="w-3.5 h-3.5" /> },
  };
  const { label, color, icon } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border", color)}>
      {icon} {label}
    </span>
  );
}

/* ─── Main component ─── */
export function CryptoDeposit({
  onSuccess,
  onCancel,
}: {
  onSuccess: (amountFcfa: number) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const { copied: addressCopied, copy: copyAddress } = useCopy();
  const { copied: amountCopied, copy: copyAmount } = useCopy();

  const [network, setNetwork] = useState<NetworkId>("trc20");
  const [networkOpen, setNetworkOpen] = useState(false);
  const [amountRaw, setAmountRaw] = useState("");
  const [status, setStatus] = useState<DepositStatus>("idle");
  const [deposit, setDeposit] = useState<CryptoDepositResponse | null>(null);

  const parsedAmount = parseInt(amountRaw.replace(/\D/g, ""), 10) || 0;
  const canGenerate = parsedAmount >= 1000 && status === "idle";
  const selectedNet = NETWORKS.find(n => n.id === network) ?? NETWORKS[0];

  const { secs: secsLeft, label: countdown } = useCountdown(deposit?.expiresAt ?? null);

  /* Auto-expire */
  useEffect(() => {
    if (deposit && secsLeft === 0 && status === "waiting") {
      setStatus("expired");
    }
  }, [secsLeft, deposit, status]);

  /* Polling */
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  const pollStatus = useCallback(async (paymentId: string, amountFcfa: number) => {
    try {
      const res = await fetch(`${BASE}/api/wallet/crypto/${paymentId}/status`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { status: string; amountFcfa: number };
      const s = data.status;

      if (s === "paid") {
        stopPolling();
        setStatus("paid");
        setTimeout(() => onSuccess(amountFcfa), 1200);
      } else if (s === "processing" || s === "confirming") {
        setStatus("processing");
      } else if (s === "failed" || s === "expired" || s === "cancelled") {
        stopPolling();
        setStatus(s === "expired" ? "expired" : "failed");
      }
    } catch { /* ignore poll errors */ }
  }, [stopPolling, onSuccess]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  async function handleGenerate() {
    if (!canGenerate) return;
    setStatus("creating");

    try {
      const res = await fetch(`${BASE}/api/wallet/crypto/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amountFcfa: parsedAmount, network }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Erreur", description: data.error ?? "Impossible de créer l'adresse." });
        setStatus("idle");
        return;
      }

      setDeposit(data as CryptoDepositResponse);
      setStatus("waiting");

      pollingRef.current = setInterval(() => pollStatus(data.paymentId, data.amountFcfa), 8000);
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur réseau", description: "Vérifiez votre connexion." });
      setStatus("idle");
    }
  }

  function handleReset() {
    stopPolling();
    setDeposit(null);
    setStatus("idle");
    setAmountRaw("");
  }

  const isTerminal = status === "paid" || status === "failed" || status === "expired";

  return (
    <div className="space-y-5">

      {/* ── Network selector ── */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">1</span>
          Réseau blockchain
        </p>

        <button
          type="button"
          disabled={status !== "idle"}
          onClick={() => setNetworkOpen(o => !o)}
          className={cn(
            "w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left",
            status !== "idle"
              ? "opacity-50 cursor-not-allowed border-card-border bg-card"
              : "border-primary/40 bg-primary/5 hover:border-primary/60"
          )}
        >
          <div className="flex items-center gap-3">
            <CryptoNetworkIcon net={selectedNet} size={32} />
            <div>
              <p className="text-sm font-bold text-foreground">{selectedNet.label}</p>
              <p className="text-[11px] text-muted-foreground">{selectedNet.desc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedNet.recommended && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                Recommandé
              </span>
            )}
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", networkOpen && "rotate-180")} />
          </div>
        </button>

        <AnimatePresence>
          {networkOpen && status === "idle" && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-2xl border border-card-border bg-card overflow-hidden shadow-xl shadow-black/20"
            >
              {NETWORKS.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { setNetwork(n.id); setNetworkOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left border-b border-card-border/40 last:border-0 transition-colors",
                    network === n.id ? "bg-primary/8" : "hover:bg-secondary/60"
                  )}
                >
                  <CryptoNetworkIcon net={n} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{n.label}</p>
                    <p className="text-[11px] text-muted-foreground">{n.desc}</p>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", n.badgeColor)}>
                    {n.badge}
                  </span>
                  {network === n.id && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Amount ── */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">2</span>
          Montant à créditer
        </p>

        <div className={cn(
          "flex items-center gap-3 px-4 rounded-2xl border-2 transition-all",
          status !== "idle" ? "opacity-50 border-card-border bg-card" : "border-primary/40 bg-primary/5 focus-within:border-primary/70"
        )}>
          <input
            type="text"
            inputMode="numeric"
            disabled={status !== "idle"}
            value={amountRaw}
            onChange={e => setAmountRaw(e.target.value.replace(/\D/g, ""))}
            placeholder="Ex: 5000"
            className="flex-1 py-3.5 bg-transparent text-foreground placeholder:text-muted-foreground/50 text-base font-bold focus:outline-none"
          />
          <span className="text-sm font-bold text-muted-foreground flex-shrink-0">FCFA</span>
        </div>

        {/* Quick presets */}
        {status === "idle" && (
          <div className="flex gap-2 flex-wrap">
            {PRESETS_FCFA.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setAmountRaw(String(p))}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                  parsedAmount === p
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-card border-card-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                )}
              >
                {p >= 1000 ? `${p / 1000}k` : p}
              </button>
            ))}
          </div>
        )}

        {/* USD equivalent preview */}
        {parsedAmount >= 1000 && status === "idle" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-muted-foreground text-right"
          >
            ≈ ${(parsedAmount / 610).toFixed(2)} USD à envoyer en USDT
          </motion.p>
        )}
      </div>

      {/* ── Generate button ── */}
      {status === "idle" && (
        <motion.button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          whileTap={canGenerate ? { scale: 0.97 } : {}}
          className={cn(
            "w-full h-13 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all relative overflow-hidden",
            canGenerate
              ? "bg-gradient-to-r from-violet-600 to-purple-700 shadow-lg shadow-violet-500/20"
              : "bg-card border border-card-border text-muted-foreground opacity-50 cursor-not-allowed"
          )}
          style={{ height: 52 }}
        >
          {canGenerate && (
            <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
          )}
          <Zap className="w-4.5 h-4.5" />
          Générer l'adresse de dépôt
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      )}

      {/* ── Creating spinner ── */}
      {status === "creating" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3 py-8"
        >
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Génération de l'adresse sécurisée…</p>
        </motion.div>
      )}

      {/* ── Deposit address card ── */}
      <AnimatePresence>
        {deposit && (status === "waiting" || status === "processing" || isTerminal) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Status header */}
            <div className="flex items-center justify-between">
              <StatusBadge status={status} />
              {status === "waiting" && secsLeft > 0 && (
                <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {countdown}
                </span>
              )}
            </div>

            {/* Paid success */}
            {status === "paid" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3 py-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-base font-black text-white">Paiement confirmé !</p>
                  <p className="text-sm text-emerald-400 font-bold">{formatFCFA(deposit.amountFcfa)} crédités</p>
                </div>
              </motion.div>
            )}

            {/* Failed / expired */}
            {(status === "failed" || status === "expired") && (
              <div className="flex flex-col items-center gap-3 py-5 bg-red-500/5 border border-red-500/20 rounded-2xl">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <div className="text-center">
                  <p className="text-sm font-bold text-foreground">
                    {status === "expired" ? "Adresse expirée" : "Paiement non reçu"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {status === "expired" ? "L'adresse de dépôt a expiré." : "Aucun paiement reçu dans le délai imparti."}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 px-4 py-2 rounded-xl hover:bg-primary/10 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Réessayer
                </button>
              </div>
            )}

            {/* Address + QR */}
            {(status === "waiting" || status === "processing") && (
              <div className="rounded-2xl border border-card-border bg-card overflow-hidden">
                {/* Amount to send */}
                <div className="px-4 py-3 bg-primary/5 border-b border-card-border/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Montant USDT à envoyer</p>
                    <p className="text-xl font-black text-foreground">{deposit.payAmountFormatted}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">sur réseau {deposit.chain}</p>
                  </div>
                  <button
                    onClick={() => copyAmount(deposit.payAmount.toFixed(6))}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 px-3 py-1.5 rounded-xl hover:bg-primary/10 transition-colors"
                  >
                    {amountCopied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {amountCopied ? "Copié !" : "Copier"}
                  </button>
                </div>

                {/* QR + Address */}
                <div className="p-4 flex flex-col items-center gap-4">
                  <QRCode data={deposit.payAddress} size={180} />

                  <div className="w-full space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Adresse de dépôt</p>
                    <div className="flex items-center gap-2 p-3 bg-secondary/40 border border-card-border/60 rounded-xl">
                      <p className="flex-1 text-xs font-mono text-foreground break-all leading-relaxed">{deposit.payAddress}</p>
                    </div>
                    <button
                      onClick={() => copyAddress(deposit.payAddress)}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all border",
                        addressCopied
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                          : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                      )}
                    >
                      {addressCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {addressCopied ? "Adresse copiée !" : "Copier l'adresse"}
                    </button>
                  </div>
                </div>

                {/* Instructions */}
                <div className="px-4 pb-4 space-y-2">
                  {[
                    `Envoyez exactement ${deposit.payAmountFormatted} sur le réseau ${deposit.chain}`,
                    "Utilisez uniquement le réseau indiqué — une mauvaise chaîne = fonds perdus",
                    "La confirmation est automatique (2–5 min après réception)",
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>

                {/* Polling indicator */}
                <div className="px-4 pb-4">
                  <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-secondary/30 border border-card-border/40">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {status === "processing" ? "Confirmation en cours…" : "Surveillance du paiement en cours…"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Reset link (non-terminal only) */}
            {!isTerminal && (
              <button
                onClick={handleReset}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1 flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Recommencer avec un autre montant
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Security notice ── */}
      <p className="text-center text-[10px] text-muted-foreground/50 flex items-center justify-center gap-1">
        <Shield className="w-3 h-3" /> Transaction sécurisée · Chiffrement SSL 256-bit
      </p>
    </div>
  );
}
