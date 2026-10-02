import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { DEPOSIT_STATUS_LABELS, checkAgeLabel, otpLabel } from "@/lib/deposit-diagnostics";

export function DepositDiagnosticsPanel() {
  const q = useQuery({
    queryKey: ["admin-deposit-diagnostics"],
    queryFn: () => adminApi.getDepositDiagnostics(),
    staleTime: 60_000,
    gcTime: 0,
    refetchOnMount: "always",
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const rows = q.data?.rows ?? [];
  return (
    <section data-testid="deposit-diagnostics" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Diagnostic des dépôts</h2>
        <button data-testid="deposit-diagnostics-refresh" onClick={() => { void q.refetch(); }} disabled={q.isFetching} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>
      <div data-testid="text-deposit-diagnostics-disclaimer" className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300/90 space-y-1">
        <p>Lecture seule. Un catalogue valide n’est pas une confirmation de paiement réel : aucun paiement n’est initié ni vérifié.</p>
        <p>Seul Clapay est audité ; les autres passerelles ne sont pas auditées et aucun changement de fournisseur n’est possible ici. Une métadonnée facultative manquante n’est pas un refus.</p>
        <p data-testid="text-deposit-diagnostics-age">
          {q.data ? `Généré ${checkAgeLabel(q.data.generatedAt)} · cache ${q.data.cacheTtlSeconds} s` : "Cache 60 s"}
        </p>
      </div>
      {q.isLoading ? <div data-testid="status-deposit-diagnostics-loading" className="flex items-center gap-2 py-8 text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" />Chargement du diagnostic…</div>
        : q.error ? <div role="alert" data-testid="status-deposit-diagnostics-error" className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"><span>{(q.error as Error).message}</span><button data-testid="deposit-diagnostics-retry" onClick={() => { void q.refetch(); }} className="px-3 py-1.5 rounded-lg border border-red-500/30 text-xs">Réessayer</button></div>
          : rows.length === 0 ? <p data-testid="status-deposit-diagnostics-empty" className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">Aucune méthode de dépôt à diagnostiquer.</p>
            : <div className="space-y-2">
              {rows.map((r) => {
                const ok = r.status === "catalogue_available";
                const key = `${r.countryCode}-${r.methodSlug}`;
                return (
                  <article key={key} data-testid={`row-deposit-diagnostic-${key}`} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-white">{r.countryCode} · {r.methodName}</p>
                      <p className="text-xs text-zinc-400">
                        {r.gateway ?? "Passerelle inconnue"}{r.routingSource ? ` · routage ${r.routingSource === "dynamic" ? "dynamique" : "historique"}` : ""}{r.operatorCode ? ` · ${r.operatorCode}` : ""} · {otpLabel(r.requiresOtp)}
                      </p>
                      <p className="text-[11px] text-zinc-600">
                        {checkAgeLabel(r.checkedAt)}{r.metadataMissing ? " · métadonnées facultatives manquantes (pas un refus)" : ""}
                      </p>
                    </div>
                    <span data-testid={`status-deposit-diagnostic-${key}`} className={`inline-flex items-center gap-1 self-start rounded-full border px-2 py-0.5 text-[11px] ${ok ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : r.status === "not_clapay" ? "bg-zinc-800 text-zinc-400 border-zinc-700" : "bg-amber-500/15 text-amber-400 border-amber-500/20"}`}>
                      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}{DEPOSIT_STATUS_LABELS[r.status]}
                    </span>
                  </article>
                );
              })}
            </div>}
    </section>
  );
}
