import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminService, type AdminCountry } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { ServiceIcon } from "@/components/service-icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ImageUploadButton } from "@/components/image-upload-button";
import {
  Loader2, Pencil, Check, X, TrendingUp, ToggleLeft, ToggleRight,
  Plus, Trash2, Star, Package, Zap, ChevronDown, ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ─── Popular services preset ─── */
const POPULAR_PRESETS: { label: string; emoji: string; slugs: string[]; markPopular: string[] }[] = [
  {
    label: "Essentiels",
    emoji: "⚡",
    slugs: ["whatsapp", "telegram", "google", "instagram", "facebook", "tiktok", "discord", "twitter", "snapchat"],
    markPopular: ["whatsapp", "telegram", "google", "instagram", "facebook", "tiktok"],
  },
  {
    label: "Finance & Tech",
    emoji: "💳",
    slugs: ["paypal", "binance", "amazon", "microsoft", "apple", "netflix", "steam", "coinbase", "ebay"],
    markPopular: ["paypal", "binance", "amazon"],
  },
  {
    label: "Afrique & Mobile",
    emoji: "🌍",
    slugs: ["viber", "line", "wechat", "uber", "airbnb", "linkedin", "youtube", "signal"],
    markPopular: ["viber", "uber", "linkedin"],
  },
];

const ALL_POPULAR_SLUGS = POPULAR_PRESETS.flatMap(p => p.slugs);
const ALL_POPULAR_MARK  = POPULAR_PRESETS.flatMap(p => p.markPopular);

/* ─── Bulk Enable Panel ─── */
function BulkEnablePanel({ services }: { services: AdminService[] }) {
  const [open, setOpen] = useState(true);
  const { toast } = useToast();
  const qc = useQueryClient();

  const existingSlugs = new Set(services.map(s => s.slug));
  const enabledSlugs  = new Set(services.filter(s => s.enabled).map(s => s.slug));

  const availablePresets = POPULAR_PRESETS.map(p => ({
    ...p,
    available: p.slugs.filter(s => existingSlugs.has(s)),
    alreadyOn: p.slugs.filter(s => enabledSlugs.has(s)),
  }));

  const totalAvailable = ALL_POPULAR_SLUGS.filter(s => existingSlugs.has(s)).length;
  const totalEnabled   = ALL_POPULAR_SLUGS.filter(s => enabledSlugs.has(s)).length;
  const allDone = totalAvailable > 0 && totalEnabled >= totalAvailable;

  const bulk = useMutation({
    mutationFn: ({ slugs, markPopular }: { slugs: string[]; markPopular: string[] }) =>
      adminApi.bulkEnableServices(slugs, markPopular),
    onSuccess: (res) => {
      toast({ title: "Services activés", description: res.message });
      qc.invalidateQueries({ queryKey: ["admin-services"] });
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const enableAll = () => {
    const toEnable = ALL_POPULAR_SLUGS.filter(s => existingSlugs.has(s));
    if (!toEnable.length) { toast({ title: "Aucun service disponible", description: "Lancez d'abord une sync 5sim depuis Fournisseurs." }); return; }
    bulk.mutate({ slugs: toEnable, markPopular: ALL_POPULAR_MARK });
  };

  if (allDone) return null;

  return (
    <div className="bg-gradient-to-br from-violet-950/30 to-zinc-900 border border-violet-700/30 rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-violet-950/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <div className="text-white font-semibold text-sm">Activation rapide des services populaires</div>
            <div className="text-zinc-500 text-xs">
              {totalAvailable > 0
                ? `${totalEnabled}/${totalAvailable} services populaires activés`
                : "Lancez une sync 5sim pour importer les services"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalAvailable > 0 && (
            <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${Math.round((totalEnabled / totalAvailable) * 100)}%` }} />
            </div>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Preset groups */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {availablePresets.map(preset => {
              const allOn = preset.available.length > 0 && preset.available.every(s => enabledSlugs.has(s));
              const someOn = preset.available.some(s => enabledSlugs.has(s));
              return (
                <div key={preset.label} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{preset.emoji} {preset.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${allOn ? "bg-emerald-500/20 text-emerald-400" : someOn ? "bg-yellow-500/20 text-yellow-400" : "bg-zinc-700 text-zinc-500"}`}>
                      {allOn ? "Tous actifs" : someOn ? "Partiel" : "Inactif"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {preset.slugs.map(slug => {
                      const exists  = existingSlugs.has(slug);
                      const enabled = enabledSlugs.has(slug);
                      return (
                        <span key={slug} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${!exists ? "bg-zinc-800 text-zinc-600" : enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"}`}>
                          {slug}
                        </span>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => bulk.mutate({ slugs: preset.available, markPopular: preset.markPopular })}
                    disabled={bulk.isPending || allOn || preset.available.length === 0}
                    className="w-full py-1.5 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-1.5"
                  >
                    {bulk.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    {allOn ? "Déjà activés" : `Activer ${preset.label}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Activate all button */}
          <button
            onClick={enableAll}
            disabled={bulk.isPending || totalAvailable === 0}
            className="w-full py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30"
          >
            {bulk.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Tout activer en un clic ({totalAvailable} services populaires)
          </button>

          <p className="text-[11px] text-zinc-600 text-center">
            Les services grisés n'ont pas encore été importés depuis 5sim · Allez dans <span className="text-violet-400">Fournisseurs → Sync produits</span>
          </p>
        </div>
      )}
    </div>
  );
}

const CATEGORIES = ["Réseaux sociaux", "Messagerie", "Services Google", "Email", "Finance", "Jeux", "Streaming", "Crypto", "Transport", "Autres"];

/* ─── Add Service Form ─── */
function AddServiceForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("Réseaux sociaux");
  const [color, setColor] = useState("#7C3AED");
  const [providerPrice, setProviderPrice] = useState("");
  const [margin, setMargin] = useState("20");
  const [price, setPrice] = useState("");
  const [available, setAvailable] = useState("0");
  const [popular, setPopular] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const autoSlug = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const pp = Number(providerPrice);
  const mg = Number(margin);
  const computedPrice = pp > 0 ? Math.round(pp + pp * (mg / 100)) : Number(price);

  const create = useMutation({
    mutationFn: () => adminApi.createService({
      name, slug, category, color,
      price: pp > 0 ? computedPrice : Number(price),
      providerPrice: pp, margin: mg,
      available: Number(available), popular,
    }),
    onSuccess: () => {
      toast({ title: "Service créé avec succès" });
      qc.invalidateQueries({ queryKey: ["admin-services"] });
      onDone();
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <div className="border border-violet-700/40 bg-violet-950/20 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm">
        <Plus className="w-4 h-4" /> Nouveau service
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Nom du service *</label>
          <input value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(autoSlug(e.target.value)); }}
            placeholder="WhatsApp, TikTok..." className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Slug unique *</label>
          <input value={slug} onChange={e => setSlug(autoSlug(e.target.value))}
            placeholder="whatsapp" className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Catégorie</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Couleur de marque</label>
          <div className="flex gap-2">
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border border-zinc-700" />
            <input value={color} onChange={e => setColor(e.target.value)} className="flex-1 px-2 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white font-mono focus:outline-none focus:border-violet-500" />
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Prix fournisseur (FCFA)</label>
          <input type="number" value={providerPrice} onChange={e => setProviderPrice(e.target.value)}
            placeholder="0" className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Marge %</label>
          <div className="flex gap-1">
            <input type="number" value={margin} onChange={e => setMargin(e.target.value)} min={0} max={500}
              className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
            <span className="flex items-center text-zinc-500 text-sm">%</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Prix final (FCFA)</label>
          {pp > 0 ? (
            <div className="px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-violet-400 font-bold">
              {formatFCFA(computedPrice)} <span className="text-zinc-600 text-xs font-normal">auto</span>
            </div>
          ) : (
            <input type="number" value={price} onChange={e => setPrice(e.target.value)}
              placeholder="500" className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500" />
          )}
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Stock disponible</label>
          <input type="number" value={available} onChange={e => setAvailable(e.target.value)}
            placeholder="0" className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-500" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <button type="button" onClick={() => setPopular(p => !p)}
            className={`relative w-10 h-5 rounded-full transition-colors ${popular ? "bg-violet-600" : "bg-zinc-700"}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${popular ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
          <span className="text-xs text-zinc-400">Marquer comme populaire</span>
        </label>
        {name && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-zinc-500">Aperçu :</span>
            <ServiceIcon name={name} slug={slug} size={32} rounded="xl" />
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => create.mutate()} disabled={create.isPending || !name || !slug}
          className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
          {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Créer le service
        </button>
        <button onClick={onDone} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors">Annuler</button>
      </div>
    </div>
  );
}

/* ─── Service Row ─── */
function ServiceRow({ service }: { service: AdminService }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [category, setCategory] = useState(service.category || "Autres");
  const [color, setColor] = useState(service.color || "#7C3AED");
  const [price, setPrice] = useState(String(service.price));
  const [providerPrice, setProviderPrice] = useState(String(service.providerPrice ?? 0));
  const [margin, setMargin] = useState(String(service.margin ?? 20));
  const [available, setAvailable] = useState(String(service.available));
  const [popular, setPopular] = useState(service.popular);
  const [enabled, setEnabled] = useState(service.enabled ?? true);
  const [logoUrl, setLogoUrl] = useState(service.logoUrl ?? "");
  const { toast } = useToast();
  const qc = useQueryClient();

  const pp = Number(providerPrice);
  const mg = Number(margin);
  const computedPrice = pp > 0 ? Math.round(pp + pp * (mg / 100)) : Number(price);

  const update = useMutation({
    mutationFn: () => adminApi.updateService(service.id, {
      name,
      category,
      color,
      price: pp > 0 ? computedPrice : Number(price),
      providerPrice: pp, margin: mg,
      available: Number(available), popular, enabled,
      logoUrl: logoUrl.trim() || null,
    }),
    onSuccess: () => { toast({ title: "Service mis à jour" }); qc.invalidateQueries({ queryKey: ["admin-services"] }); setEditing(false); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const toggleEnabled = useMutation({
    mutationFn: () => adminApi.updateService(service.id, { enabled: !service.enabled }),
    onSuccess: () => { toast({ title: service.enabled ? "Service désactivé" : "Service activé" }); qc.invalidateQueries({ queryKey: ["admin-services"] }); },
  });

  const deleteSvc = useMutation({
    mutationFn: () => adminApi.deleteService(service.id),
    onSuccess: () => { toast({ title: "Service supprimé" }); qc.invalidateQueries({ queryKey: ["admin-services"] }); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const openEdit = () => {
    setName(service.name); setCategory(service.category || "Autres"); setColor(service.color || "#7C3AED");
    setPrice(String(service.price)); setProviderPrice(String(service.providerPrice ?? 0));
    setMargin(String(service.margin ?? 20)); setAvailable(String(service.available));
    setPopular(service.popular); setEnabled(service.enabled ?? true);
    setLogoUrl(service.logoUrl ?? "");
    setEditing(true);
  };

  return (
    <>
      <tr className={`border-b border-zinc-800 hover:bg-zinc-800/20 transition-colors ${editing ? "bg-zinc-800/30" : ""}`}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <ServiceIcon name={service.name} slug={service.slug} logoUrl={service.logoUrl} size={32} rounded="lg" />
            <div>
              <span className="text-white text-sm font-medium">{service.name}</span>
              <div className="text-zinc-600 text-xs font-mono">{service.slug}</div>
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          <span className="text-zinc-400 text-xs px-2 py-1 bg-zinc-800 rounded-lg">{service.category || "—"}</span>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0 border border-zinc-600" style={{ backgroundColor: service.color || "#7C3AED" }} />
            <span className="text-zinc-500 text-xs font-mono">{service.color || "—"}</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <span className="text-zinc-400 text-sm">{service.providerPrice > 0 ? formatFCFA(service.providerPrice) : <span className="text-zinc-600 italic text-xs">—</span>}</span>
        </td>
        <td className="py-3 px-4">
          <span className="text-emerald-400 text-sm font-medium">+{service.margin ?? 20}%</span>
        </td>
        <td className="py-3 px-4">
          <span className="text-white text-sm font-bold">{formatFCFA(service.price)}</span>
        </td>
        <td className="py-3 px-4">
          <span className="text-zinc-300 text-sm">{service.available.toLocaleString("fr-FR")}</span>
        </td>
        <td className="py-3 px-4">
          <span className={`text-xs px-2 py-1 rounded-full ${service.popular ? "bg-violet-500/20 text-violet-400" : "bg-zinc-800 text-zinc-500"}`}>
            {service.popular ? "⭐ Populaire" : "Normal"}
          </span>
        </td>
        <td className="py-3 px-4">
          <button onClick={() => toggleEnabled.mutate()} disabled={toggleEnabled.isPending} className="flex items-center gap-1 transition-colors">
            {service.enabled
              ? <ToggleRight className="w-6 h-6 text-emerald-500" />
              : <ToggleLeft className="w-6 h-6 text-zinc-600" />}
            <span className={`text-xs ${service.enabled ? "text-emerald-500" : "text-zinc-600"}`}>{service.enabled ? "Actif" : "Inactif"}</span>
          </button>
        </td>
        <td className="py-3 px-4">
          <div className="flex gap-1.5">
            <button onClick={openEdit} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: `Supprimer "${service.name}" ?`,
                  message: "Cette action est irréversible. Le service et tous ses numéros associés seront supprimés.",
                  confirmLabel: "Supprimer",
                  cancelLabel: "Annuler",
                  variant: "danger",
                });
                if (ok) deleteSvc.mutate();
              }}
              disabled={deleteSvc.isPending}
              className="p-1.5 rounded hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {/* Edit panel */}
      {editing && (
        <tr className="border-b border-violet-700/30 bg-violet-950/10">
          <td colSpan={10} className="px-4 py-4">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Nom affiché</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full px-2.5 py-2 text-sm bg-zinc-900 border border-violet-500/50 rounded-lg text-white focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Catégorie</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-2.5 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Couleur</label>
                <div className="flex gap-1.5">
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-9 h-9 rounded border border-zinc-700 cursor-pointer" />
                  <input value={color} onChange={e => setColor(e.target.value)} className="flex-1 px-2 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-white font-mono focus:outline-none focus:border-violet-500" />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-zinc-400 mb-1 block">Stock</label>
                  <input type="number" value={available} onChange={e => setAvailable(e.target.value)} className="w-full px-2.5 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Prix fournisseur (FCFA)</label>
                <input type="number" value={providerPrice} onChange={e => setProviderPrice(e.target.value)} className="w-full px-2.5 py-2 text-sm bg-zinc-900 border border-blue-500/50 rounded-lg text-white focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Marge %</label>
                <input type="number" value={margin} onChange={e => setMargin(e.target.value)} min={0} max={500} className="w-full px-2.5 py-2 text-sm bg-zinc-900 border border-emerald-500/50 rounded-lg text-white focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Prix final (FCFA)</label>
                {pp > 0 ? (
                  <div className="px-2.5 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-violet-400 font-bold">{formatFCFA(computedPrice)}</div>
                ) : (
                  <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full px-2.5 py-2 text-sm bg-zinc-900 border border-violet-500/50 rounded-lg text-white focus:outline-none" />
                )}
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Options</label>
                <div className="flex gap-2 flex-wrap pt-1">
                  <button type="button" onClick={() => setPopular(p => !p)} className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${popular ? "bg-violet-600/20 border-violet-500/40 text-violet-400" : "border-zinc-700 text-zinc-500"}`}>
                    <Star className="w-3 h-3" /> Populaire
                  </button>
                  <button type="button" onClick={() => setEnabled(e => !e)} className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${enabled ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}>
                    {enabled ? "Actif" : "Inactif"}
                  </button>
                </div>
              </div>
            </div>

            {/* Logo URL row */}
            <div className="mb-3">
              <label className="text-xs text-zinc-400 mb-1 block">Logo personnalisé (URL de l'image)</label>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <input
                    value={logoUrl}
                    onChange={e => setLogoUrl(e.target.value)}
                    placeholder="https://cdn.example.com/logo.png — laisser vide pour l'icône auto"
                    className="w-full px-2.5 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 pr-10"
                  />
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <ImageUploadButton
                  onUploaded={url => setLogoUrl(url)}
                  busy={update.isPending}
                  label="Fichier"
                />
                {/* Logo preview */}
                <div className="flex-shrink-0">
                  <ServiceIcon name={name || service.name} slug={service.slug} logoUrl={logoUrl.trim() || null} size={36} rounded="lg" />
                </div>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">
                Exemples : <span className="text-violet-400 font-mono">https://simpleicons.org/icons/whatsapp.svg</span> · <span className="text-violet-400 font-mono">https://logo.clearbit.com/whatsapp.com</span>
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => update.mutate()} disabled={update.isPending} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5">
                {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Enregistrer
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" />Annuler
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Country Row ─── */
function CountryRow({ country }: { country: AdminCountry }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(country.price));
  const [available, setAvailable] = useState(String(country.available));
  const { toast } = useToast();
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: () => adminApi.updateCountry(country.id, { price: Number(price), available: Number(available) }),
    onSuccess: () => { toast({ title: "Pays mis à jour" }); qc.invalidateQueries({ queryKey: ["admin-countries"] }); setEditing(false); },
  });

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/20 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{country.flag}</span>
          <div>
            <span className="text-white text-sm">{country.name}</span>
            <div className="text-zinc-600 text-xs font-mono">{country.code}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-zinc-400 text-sm">{country.dialCode}</td>
      <td className="py-3 px-4">
        {editing ? <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-24 px-2 py-1 text-sm bg-zinc-800 border border-violet-500 rounded text-white focus:outline-none" />
          : <span className="text-white text-sm font-semibold">{formatFCFA(country.price)}</span>}
      </td>
      <td className="py-3 px-4">
        {editing ? <input type="number" value={available} onChange={e => setAvailable(e.target.value)} className="w-20 px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-white focus:outline-none" />
          : <span className="text-zinc-300 text-sm">{country.available.toLocaleString("fr-FR")}</span>}
      </td>
      <td className="py-3 px-4">
        {editing ? (
          <div className="flex gap-1.5">
            <button onClick={() => update.mutate()} disabled={update.isPending} className="p-1.5 rounded bg-emerald-600 text-white"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditing(false)} className="p-1.5 rounded bg-zinc-700 text-zinc-400"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
        )}
      </td>
    </tr>
  );
}

/* ─── Main ─── */
function ServicesContent() {
  const [tab, setTab] = useState<"services" | "countries">("services");
  const [showAddForm, setShowAddForm] = useState(false);
  const { data: services, isLoading: loadingS } = useQuery({ queryKey: ["admin-services"], queryFn: adminApi.getServices });
  const { data: countries, isLoading: loadingC } = useQuery({ queryKey: ["admin-countries"], queryFn: adminApi.getCountries });

  const activeServices = services?.filter(s => s.enabled).length ?? 0;
  const inactiveServices = (services?.length ?? 0) - activeServices;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Services & Tarification</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {activeServices} actifs · {inactiveServices} inactifs · Prix = prix fournisseur × (1 + marge%)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
            <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
            <span>Prix final = Prix fournisseur + Marge %</span>
          </div>
          {tab === "services" && (
            <button onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors">
              <Plus className="w-4 h-4" />Ajouter
            </button>
          )}
        </div>
      </div>

      {/* Add form */}
      {showAddForm && tab === "services" && (
        <AddServiceForm onDone={() => setShowAddForm(false)} />
      )}

      {/* Bulk activation panel — only shown on services tab when there are inactive popular services */}
      {tab === "services" && services && services.length > 0 && (
        <BulkEnablePanel services={services} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {(["services", "countries"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white"}`}>
            {t === "services" ? `Services (${services?.length ?? 0})` : `Pays (${countries?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {tab === "services" ? (
            services?.length === 0 && !loadingS ? (
              <div className="text-center py-16">
                <Package className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">Aucun service créé</p>
                <p className="text-zinc-600 text-xs mt-1">Cliquez sur "Ajouter" pour créer votre premier service</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80">
                    {["Service", "Catégorie", "Couleur", "Prix fourn.", "Marge", "Prix final", "Stock", "Badge", "Activé", ""].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingS
                    ? <tr><td colSpan={10} className="py-12 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
                    : services?.map(s => <ServiceRow key={s.id} service={s} />)}
                </tbody>
              </table>
            )
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  {["Pays", "Indicatif", "Prix", "Stock", ""].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingC
                  ? <tr><td colSpan={5} className="py-12 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
                  : countries?.map(c => <CountryRow key={c.id} country={c} />)}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminServices() {
  return (
    <AdminGuard>
      <AdminLayout>
        <ServicesContent />
      </AdminLayout>
    </AdminGuard>
  );
}
