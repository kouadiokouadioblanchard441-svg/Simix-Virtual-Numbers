import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type LivePriceService } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import {
  Loader2, TrendingUp, RefreshCw, Search, DollarSign,
  AlertTriangle, CheckCircle2, XCircle, Zap, Globe, ArrowUpRight,
} from "lucide-react";

const COUNTRY_FLAGS: Record<string, string> = {
  ivorycoast: "🇨🇮", senegal: "🇸🇳", cameroon: "🇨🇲", nigeria: "🇳🇬",
  ghana: "🇬🇭", togo: "🇹🇬", france: "🇫🇷", usa: "🇺🇸", india: "🇮🇳",
};

function ServiceRow({ service, markup }: { service: LivePriceService; markup: number }) {
  const margin = service.priceWithMarkup - service.priceFcfa;
  const marginPct = service.priceFcfa > 0 ? Math.round((margin / service.priceFcfa) * 100) : 0;

  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-600/30 flex items-center justify-center">
            <span className="text-xs font-bold text-violet-400">{service.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div className="text-sm font-medium text-white capitalize">{service.name}</div>
            <div className="text-xs text-zinc-500 font-mono">{service.slug}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${service.qty > 100 ? "bg-emerald-500/20 text-emerald-400" : service.qty > 10 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
          {service.qty.toLocaleString()} dispo.
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="text-sm text-zinc-300">${service.priceUsd.toFixed(4)}</div>
        <div className="text-xs text-zinc-600">USD</div>
      </td>
      <td className="py-3 px-4">
        <div className="text-sm font-semibold text-white">{formatFCFA(service.priceFcfa)}</div>
        <div className="text-xs text-zinc-600">Prix fournisseur</div>
      </td>
      <td className="py-3 px-4">
        <div className="text-sm font-bold text-violet-400">{formatFCFA(service.priceWithMarkup)}</div>
        <div className="text-xs text-zinc-600">Avec marge {markup}%</div>
      </td>
      <td className="py-3 px-4">
        <div className="text-sm text-emerald-400">+{formatFCFA(margin)}</div>
        <div className="text-xs text-zinc-600">{marginPct}% marge brute</div>
      </td>
    </tr>
  );
}

function LivePricesContent() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "price" | "qty">("qty");
  const [refetchKey, setRefetchKey] = useState(0);

  const { data, isLoading, isRefetching, dataUpdatedAt } = useQuery({
    queryKey: ["admin-live-prices", refetchKey],
    queryFn: adminApi.getLivePriceServices,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const services = (data?.services ?? [])
    .filter(s => !search || s.slug.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "price") return a.priceFcfa - b.priceFcfa;
      if (sortBy === "qty") return b.qty - a.qty;
      return a.name.localeCompare(b.name);
    });

  const totalServices = data?.total ?? 0;
  const markup = data?.markup ?? 0;
  const avgPrice = services.length > 0 ? services.reduce((s, v) => s + v.priceFcfa, 0) / services.length : 0;
  const minPrice = services.length > 0 ? Math.min(...services.map(s => s.priceFcfa)) : 0;
  const maxPrice = services.length > 0 ? Math.max(...services.map(s => s.priceFcfa)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            Prix en temps réel — 5sim
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Prix bruts du fournisseur avant votre marge. Source : pays France (large catalogue).
            {dataUpdatedAt ? ` · Mis à jour ${new Date(dataUpdatedAt).toLocaleTimeString("fr-FR")}` : ""}
          </p>
        </div>
        <button
          onClick={() => setRefetchKey(k => k + 1)}
          disabled={isLoading || isRefetching}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <Globe className="w-5 h-5 text-violet-400 mb-2" />
          <div className="text-2xl font-bold text-white">{totalServices}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Services disponibles</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <DollarSign className="w-5 h-5 text-blue-400 mb-2" />
          <div className="text-lg font-bold text-white">{formatFCFA(Math.round(avgPrice))}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Prix moyen fournisseur</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <TrendingUp className="w-5 h-5 text-emerald-400 mb-2" />
          <div className="text-lg font-bold text-white">{formatFCFA(minPrice)}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Prix minimum</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <ArrowUpRight className="w-5 h-5 text-orange-400 mb-2" />
          <div className="text-2xl font-bold text-white">{markup}%</div>
          <div className="text-xs text-zinc-500 mt-0.5">Votre marge actuelle</div>
        </div>
      </div>

      {/* Markup explanation */}
      <div className="bg-violet-900/20 border border-violet-700/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <DollarSign className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-violet-300 text-sm font-medium">Comment est calculé votre prix de vente ?</p>
            <p className="text-violet-400/70 text-xs mt-1">
              <strong>Prix fournisseur (FCFA)</strong> = Prix 5sim (USD) × 655 (taux de change)<br />
              <strong>Votre prix de vente</strong> = Prix fournisseur × (1 + {markup}% marge)<br />
              Pour modifier la marge, rendez-vous dans <strong>Fournisseurs → 5sim → Modifier markup</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un service..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
        >
          <option value="qty">Trier par disponibilité</option>
          <option value="price">Trier par prix croissant</option>
          <option value="name">Trier par nom</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <span className="text-sm text-zinc-400">
            {isLoading ? "Chargement..." : `${services.length} service${services.length !== 1 ? "s" : ""} affiché${services.length !== 1 ? "s" : ""}`}
            {search && ` · filtre: "${search}"`}
          </span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="text-center space-y-3">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin mx-auto" />
              <p className="text-zinc-500 text-sm">Récupération des prix depuis 5sim...</p>
            </div>
          </div>
        ) : !data ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <p className="text-zinc-400 font-medium">Fournisseur 5sim non configuré</p>
            <p className="text-zinc-600 text-sm mt-1">Configurez la clé API dans Fournisseurs</p>
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">Aucun service correspondant</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left bg-zinc-900/80">
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Service</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Disponibilité</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Prix USD</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Prix FCFA brut</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Votre prix</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Marge</th>
                </tr>
              </thead>
              <tbody>
                {services.map(s => <ServiceRow key={s.slug} service={s} markup={markup} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminLivePrices() {
  return (
    <AdminGuard>
      <AdminLayout>
        <LivePricesContent />
      </AdminLayout>
    </AdminGuard>
  );
}
