import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";

export function ClapayCatalogueSync() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => adminApi.syncClapayCatalogue(),
    onSuccess: result => {
      toast({
        title: result.errors.length ? "Synchronisation partielle" : "Catalogue Clapay synchronisé",
        description: `${result.configsAdded} configurations ajoutées. Les nouveaux moyens de dépôt sont à valider dans « Config par pays ».`,
      });
      for (const key of [
        "admin-payment-methods", "admin-payment-configs", "admin-countries",
        "admin-deposit-diagnostics", "deposit-countries", "deposit-methods", "wallet-payment-options",
      ]) void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: error => toast({
      title: "Synchronisation impossible",
      description: (error as Error).message,
      variant: "destructive",
    }),
  });
  const result = mutation.data;

  return (
    <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3" data-testid="clapay-catalogue-sync">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-white">Catalogue des opérateurs Clapay</h2>
          <p className="text-xs text-zinc-400 max-w-2xl">
            Importez les opérateurs proposés par pays. Les nouvelles configurations restent désactivées
            jusqu’à votre validation dans « Config par pays ». Vos frais, minimums et activations existants sont conservés.
          </p>
          <p className="text-xs text-zinc-500">Aucun paiement n’est déclenché par cette synchronisation.</p>
        </div>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => {
            if (window.confirm("Importer le catalogue Clapay ? Les nouveaux moyens de dépôt resteront désactivés jusqu’à votre validation. Les tarifs et activations existants seront conservés.")) {
              mutation.mutate();
            }
          }}
          data-testid="button-sync-clapay-catalogue"
          className="flex items-center justify-center gap-2 shrink-0 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {mutation.isPending ? "Synchronisation…" : "Synchroniser Clapay"}
        </button>
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-red-300" data-testid="error-clapay-catalogue-sync">
          {(mutation.error as Error).message}
        </p>
      )}
      {result && (
        <div role="status" className="space-y-2 text-xs text-zinc-300" data-testid="result-clapay-catalogue-sync">
          <p className="flex items-center gap-2 font-semibold">
            {result.errors.length || result.blocked.length
              ? <AlertTriangle className="h-4 w-4 text-amber-400" />
              : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {result.countriesChecked} pays vérifiés · {result.operatorsFound} opérateurs/pays trouvés
          </p>
          <p>
            {result.methodsAdded} nouveaux moyens de paiement · {result.configsAdded} configurations ajoutées
            · {result.associationsAdded} associations pays/opérateur ajoutées
          </p>
          <p className="text-cyan-300">
            {result.reviewRequired} configurations à valider. Activez-les dans « Config par pays » après avoir vérifié leurs frais et minimums.
          </p>
          {(result.errors.length > 0 || result.blocked.length > 0) && (
            <details className="rounded-lg border border-amber-500/20 p-3">
              <summary className="cursor-pointer text-amber-300">
                {result.errors.length + result.blocked.length} éléments nécessitent une vérification
              </summary>
              <ul className="mt-2 space-y-1">
                {result.errors.map((error, i) => (
                  <li key={`error-${i}`}>{error.countryCode ?? "Clapay"} : {error.message}</li>
                ))}
                {result.blocked.map((entry, i) => (
                  <li key={`blocked-${i}`}>{entry.countryCode} · {entry.operatorName} : {entry.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}