import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { formatFCFA } from "@/lib/format";
import { Loader2, Copy, User as UserIcon, Smartphone, Wallet, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const TX_LABELS: Record<string, string> = {
  recharge: "Recharge",
  purchase: "Achat",
  refund: "Remboursement",
  referral: "Commission parrainage",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Complété",
  pending: "En attente",
  failed: "Échoué",
  cancelled: "Annulé",
};

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm text-zinc-200 mt-0.5 break-words ${mono ? "font-mono" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}

function CopyableId({ value }: { value: string }) {
  const { toast } = useToast();
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast({ title: "Copié dans le presse-papiers" });
      }}
      className="inline-flex items-center gap-1.5 text-sm text-zinc-200 font-mono hover:text-violet-400 transition-colors"
      title="Copier"
    >
      {value}
      <Copy className="w-3.5 h-3.5 text-zinc-500" />
    </button>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof UserIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300 mb-3">
      <Icon className="w-4 h-4 text-violet-400" />
      {children}
    </div>
  );
}

export function TransactionDetailModal({
  transactionId,
  onClose,
}: {
  transactionId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-transaction-detail", transactionId],
    queryFn: () => adminApi.getTransaction(transactionId!),
    enabled: !!transactionId,
  });

  return (
    <Dialog open={!!transactionId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-800 text-white max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Détail de la transaction</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
          </div>
        )}

        {!!error && (
          <div className="py-8 text-center text-red-400 text-sm">
            {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* ── Transaction ── */}
            <div>
              <SectionTitle icon={Wallet}>Transaction</SectionTitle>
              <div className="grid grid-cols-2 gap-4 bg-zinc-800/50 border border-zinc-800 rounded-xl p-4">
                <div className="col-span-2">
                  <Field label="ID de la transaction" value={<CopyableId value={data.id} />} />
                </div>
                <Field label="Type" value={TX_LABELS[data.type] ?? data.type} />
                <Field
                  label="Statut"
                  value={
                    <span className={`text-xs px-2 py-1 rounded-full ${data.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : data.status === "failed" ? "bg-red-500/20 text-red-400" : "bg-zinc-700 text-zinc-300"}`}>
                      {STATUS_LABELS[data.status] ?? data.status}
                    </span>
                  }
                />
                <Field
                  label="Montant"
                  value={
                    <span className={`font-bold ${data.type === "purchase" ? "text-white" : "text-emerald-400"}`}>
                      {data.type === "purchase" ? "-" : "+"}{formatFCFA(data.amount)}
                    </span>
                  }
                />
                <Field label="Méthode" value={data.method} />
                <div className="col-span-2">
                  <Field label="Description" value={data.description} />
                </div>
                {data.externalDepositId && (
                  <div className="col-span-2">
                    <Field label="ID dépôt externe (opérateur)" value={<CopyableId value={data.externalDepositId} />} />
                  </div>
                )}
                <Field label="Date" value={new Date(data.createdAt).toLocaleString("fr-FR")} />
              </div>
            </div>

            {/* ── Gateway metadata ── */}
            {data.gatewayMeta && Object.keys(data.gatewayMeta).length > 0 && (
              <div>
                <SectionTitle icon={ShieldAlert}>Informations passerelle de paiement</SectionTitle>
                <div className="grid grid-cols-2 gap-4 bg-zinc-800/50 border border-zinc-800 rounded-xl p-4">
                  {Object.entries(data.gatewayMeta).map(([key, value]) => (
                    <Field key={key} label={key} value={String(value)} />
                  ))}
                </div>
              </div>
            )}

            {/* ── User ── */}
            {data.user && (
              <div>
                <SectionTitle icon={UserIcon}>Utilisateur</SectionTitle>
                <div className="grid grid-cols-2 gap-4 bg-zinc-800/50 border border-zinc-800 rounded-xl p-4">
                  <div className="col-span-2">
                    <Field label="ID utilisateur" value={<CopyableId value={data.user.id} />} />
                  </div>
                  <Field label="Nom complet" value={data.user.fullName} />
                  <Field label="Nom d'utilisateur" value={data.user.username} />
                  <Field label="Téléphone" value={`${data.user.countryCode} ${data.user.phone ?? "—"}`} />
                  <Field label="Email" value={data.user.email} />
                  <Field label="Pays" value={data.user.country} />
                  <Field label="Solde actuel" value={formatFCFA(data.user.balance)} />
                  <Field label="Statut du compte" value={data.user.status} />
                  <Field label="Vérifié" value={data.user.verified ? "Oui" : "Non"} />
                  <Field label="Score de risque" value={data.user.riskScore} />
                  <Field label="Compte créé le" value={new Date(data.user.createdAt).toLocaleString("fr-FR")} />
                </div>
              </div>
            )}

            {/* ── Related virtual number ── */}
            {data.relatedNumber && (
              <div>
                <SectionTitle icon={Smartphone}>Numéro virtuel associé</SectionTitle>
                <div className="grid grid-cols-2 gap-4 bg-zinc-800/50 border border-zinc-800 rounded-xl p-4">
                  <div className="col-span-2">
                    <Field label="ID du numéro" value={<CopyableId value={data.relatedNumber.id} />} />
                  </div>
                  <Field label="Numéro de téléphone" value={data.relatedNumber.phoneNumber} mono />
                  <Field label="Statut" value={data.relatedNumber.status} />
                  <Field label="Service" value={data.relatedNumber.serviceName} />
                  <Field label="Pays" value={data.relatedNumber.countryName} />
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
