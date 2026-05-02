import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type PaymentConfig } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, ToggleLeft, ToggleRight, Globe, CreditCard, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function ConfigCell({
  config,
  countryCode,
  method,
}: {
  config: PaymentConfig | undefined;
  countryCode: string;
  method: { slug: string; name: string; color: string };
}) {
  const enabled = config?.enabled ?? false;
  const minDeposit = config?.minDeposit ?? 500;
  const feePercent = config?.feePercent ?? 0;
  const [editing, setEditing] = useState(false);
  const [minDep, setMinDep] = useState(String(minDeposit));
  const [fee, setFee] = useState(String(feePercent));
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (newEnabled: boolean) =>
      adminApi.updatePaymentConfig({
        countryCode,
        methodSlug: method.slug,
        enabled: newEnabled,
        minDeposit: Number(minDep),
        feePercent: Number(fee),
      }),
    onSuccess: () => { toast({ title: "Configuration mise à jour" }); qc.invalidateQueries({ queryKey: ["admin-payment-configs"] }); setEditing(false); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <td className="py-2 px-3 border-r border-zinc-800/50 last:border-r-0">
      <div className="flex flex-col items-center gap-1 min-w-[90px]">
        <button
          onClick={() => save.mutate(!enabled)}
          disabled={save.isPending}
          className="transition-colors"
          title={enabled ? "Désactiver" : "Activer"}
        >
          {save.isPending
            ? <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            : enabled
              ? <ToggleRight className="w-6 h-6 text-emerald-500" />
              : <ToggleLeft className="w-6 h-6 text-zinc-600" />
          }
        </button>

        {enabled && !editing && (
          <button onClick={() => setEditing(true)} className="text-[10px] text-zinc-500 hover:text-zinc-300 underline transition-colors">
            Min: {formatFCFA(minDeposit)} {feePercent > 0 ? `· ${feePercent}%` : ""}
          </button>
        )}

        {enabled && editing && (
          <div className="flex flex-col gap-1 w-full">
            <input type="number" value={minDep} onChange={e => setMinDep(e.target.value)} placeholder="Min dépôt" className="w-full px-1.5 py-0.5 text-[11px] bg-zinc-900 border border-zinc-700 rounded text-white focus:outline-none focus:border-violet-500" />
            <div className="flex items-center gap-1">
              <input type="number" value={fee} onChange={e => setFee(e.target.value)} placeholder="Frais %" min={0} max={100} className="w-full px-1.5 py-0.5 text-[11px] bg-zinc-900 border border-zinc-700 rounded text-white focus:outline-none focus:border-violet-500" />
              <span className="text-zinc-600 text-[10px]">%</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => save.mutate(true)} disabled={save.isPending} className="flex-1 text-[10px] py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors">OK</button>
              <button onClick={() => setEditing(false)} className="flex-1 text-[10px] py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded transition-colors">✕</button>
            </div>
          </div>
        )}
      </div>
    </td>
  );
}

function PaymentConfigContent() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["admin-payment-configs"], queryFn: adminApi.getPaymentConfigs });

  const configMap = new Map<string, PaymentConfig>();
  for (const c of data?.configs ?? []) {
    configMap.set(`${c.countryCode}:${c.methodSlug}`, c);
  }

  const filtered = data?.countries.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const enabledCount = data?.configs.filter(c => c.enabled).length ?? 0;
  const totalCombos = (data?.countries.length ?? 0) * (data?.methods.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Méthodes de paiement par pays</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {enabledCount} combinaisons actives sur {totalCombos} possibles
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrer par pays..."
            className="pl-9 pr-4 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 w-64"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="text-xs text-zinc-500 font-medium mr-2">Légende :</div>
        <div className="flex items-center gap-1.5"><ToggleRight className="w-4 h-4 text-emerald-500" /><span className="text-xs text-zinc-400">Activé — méthode disponible pour ce pays</span></div>
        <div className="flex items-center gap-1.5"><ToggleLeft className="w-4 h-4 text-zinc-600" /><span className="text-xs text-zinc-400">Désactivé — non disponible</span></div>
        <div className="flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-violet-400" /><span className="text-xs text-zinc-400">Cliquez sur "min:" pour modifier dépôt minimum & frais</span></div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide sticky left-0 bg-zinc-900 z-10 min-w-[160px]">
                    <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Pays</div>
                  </th>
                  {data?.methods.map(m => (
                    <th key={m.slug} className="py-3 px-3 text-center border-r border-zinc-800/50 last:border-r-0">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${m.color}25`, color: m.color }}>
                          <CreditCard className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-semibold text-zinc-300 whitespace-nowrap">{m.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={(data?.methods.length ?? 0) + 1} className="py-12 text-center text-zinc-500">Aucun pays trouvé</td></tr>
                ) : (
                  filtered.map(country => (
                    <tr key={country.code} className="border-b border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
                      <td className="py-2 px-4 sticky left-0 bg-zinc-900 z-10">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{country.flag}</span>
                          <div>
                            <div className="text-white text-sm font-medium">{country.name}</div>
                            <div className="text-zinc-600 text-xs font-mono">{country.code}</div>
                          </div>
                        </div>
                      </td>
                      {data?.methods.map(method => (
                        <ConfigCell
                          key={method.slug}
                          config={configMap.get(`${country.code}:${method.slug}`)}
                          countryCode={country.code}
                          method={method}
                        />
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPaymentConfig() {
  return (
    <AdminGuard>
      <AdminLayout>
        <PaymentConfigContent />
      </AdminLayout>
    </AdminGuard>
  );
}
