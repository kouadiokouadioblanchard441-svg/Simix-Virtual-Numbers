import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminGuard } from "@/components/admin-guard";
import { adminToken } from "@/lib/admin-token";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Pencil, Trash2, Upload, X, Check, ChevronUp, ChevronDown,
  Image, Loader2, Eye, EyeOff, Link as LinkIcon, Palette, GripVertical,
  ToggleLeft, ToggleRight, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...adminToken.getHeader(), "content-type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error((e as any).error); }
  return res.json() as Promise<T>;
}

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageData: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  bgFrom: string;
  bgTo: string;
  textColor: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const EMPTY_FORM = {
  title: "", subtitle: "", imageData: "", imageUrl: "", linkUrl: "", linkLabel: "",
  bgFrom: "#7C3AED", bgTo: "#4C1D95", textColor: "#FFFFFF", isActive: true, sortOrder: 0,
};

const QUICK_PALETTES = [
  { label: "Violet", from: "#7C3AED", to: "#4C1D95" },
  { label: "Nuit", from: "#1e1b4b", to: "#312e81" },
  { label: "Océan", from: "#0284c7", to: "#0c4a6e" },
  { label: "Émeraude", from: "#059669", to: "#064E3B" },
  { label: "Rose", from: "#db2777", to: "#831843" },
  { label: "Feu", from: "#ea580c", to: "#7c2d12" },
  { label: "Or", from: "#d97706", to: "#78350f" },
  { label: "Ardoise", from: "#475569", to: "#1e293b" },
];

function ColorSwatch({ from, to, label, active, onClick }: { from: string; to: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-9 h-9 rounded-xl border-2 transition-all hover:scale-105 ${active ? "border-white scale-105 shadow-lg" : "border-transparent"}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    />
  );
}

function LivePreview({ form }: { form: typeof EMPTY_FORM }) {
  const img = form.imageData || form.imageUrl;
  return (
    <div
      className="relative w-full h-40 rounded-2xl overflow-hidden shadow-xl"
      style={{ background: `linear-gradient(135deg, ${form.bgFrom}, ${form.bgTo})` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_65%)]" />
      <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: form.bgFrom }} />
      {img && (
        <img src={img} alt="aperçu" className="absolute right-0 bottom-0 h-full object-contain object-right-bottom opacity-90 pointer-events-none" />
      )}
      <div className="relative z-10 p-5 max-w-[60%]">
        <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mb-1.5" style={{ color: form.textColor }}>Aperçu live</p>
        <p className="text-xl font-extrabold leading-tight" style={{ color: form.textColor }}>
          {form.title || "Titre de la bannière"}
        </p>
        {form.subtitle && <p className="text-xs mt-1.5 opacity-80 leading-relaxed" style={{ color: form.textColor }}>{form.subtitle}</p>}
        {form.linkLabel && (
          <div className="mt-3 inline-block bg-white/25 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold" style={{ color: form.textColor }}>
            {form.linkLabel} →
          </div>
        )}
      </div>
    </div>
  );
}

function BannerEditor({ initial, onSave, onCancel, saving, title }: {
  initial: typeof EMPTY_FORM;
  onSave: (form: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}) {
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setForm(initial); }, [initial.title, initial.bgFrom]);

  function set<K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { set("imageData", await fileToBase64(file)); }
    finally { setUploading(false); e.target.value = ""; }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="bg-zinc-900 border border-zinc-700/60 rounded-2xl overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <h2 className="text-sm font-bold text-white">{title}</h2>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Live preview */}
        <LivePreview form={form} />

        {/* Fields */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Titre <span className="text-red-400">*</span></label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="Ex: Obtenez votre numéro virtuel !"
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Sous-titre</label>
            <input
              value={form.subtitle}
              onChange={e => set("subtitle", e.target.value)}
              placeholder="Courte description sous le titre"
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
            />
          </div>

          {/* Image */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Image de la bannière</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 border border-zinc-700 hover:border-violet-500/60 rounded-xl text-sm text-zinc-300 hover:text-white transition-all disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin text-violet-400" /> : <Upload className="w-4 h-4" />}
                {form.imageData ? "Changer l'image" : "Téléverser une image"}
              </button>
              {form.imageData && (
                <button
                  onClick={() => set("imageData", "")}
                  className="px-3 py-2.5 bg-red-950/40 border border-red-800/40 rounded-xl text-red-400 hover:bg-red-950/70 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {form.imageData && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-3.5 h-3.5" /> Image chargée
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">URL image externe (optionnel)</label>
            <input
              value={form.imageUrl}
              onChange={e => set("imageUrl", e.target.value)}
              placeholder="https://cdn.exemple.com/image.png"
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Lien (URL)</label>
              <input
                value={form.linkUrl}
                onChange={e => set("linkUrl", e.target.value)}
                placeholder="/services"
                className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Texte du bouton</label>
              <input
                value={form.linkLabel}
                onChange={e => set("linkLabel", e.target.value)}
                placeholder="Découvrir →"
                className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
              />
            </div>
          </div>

          {/* Gradient color config */}
          <div className="bg-zinc-800/40 rounded-xl p-4 space-y-4 border border-zinc-700/40">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold text-zinc-300">Couleurs du fond</span>
            </div>

            {/* Quick palettes */}
            <div>
              <p className="text-[11px] text-zinc-500 mb-2">Palettes rapides</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_PALETTES.map(p => (
                  <ColorSwatch
                    key={p.label}
                    from={p.from}
                    to={p.to}
                    label={p.label}
                    active={form.bgFrom === p.from && form.bgTo === p.to}
                    onClick={() => { set("bgFrom", p.from); set("bgTo", p.to); }}
                  />
                ))}
              </div>
            </div>

            {/* Custom gradient */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-zinc-500 mb-1.5">Couleur début</p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.bgFrom}
                    onChange={e => set("bgFrom", e.target.value)}
                    className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-zinc-700 p-0.5 flex-shrink-0"
                  />
                  <input
                    value={form.bgFrom}
                    onChange={e => set("bgFrom", e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-violet-500"
                    placeholder="#7C3AED"
                  />
                </div>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500 mb-1.5">Couleur fin</p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.bgTo}
                    onChange={e => set("bgTo", e.target.value)}
                    className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-zinc-700 p-0.5 flex-shrink-0"
                  />
                  <input
                    value={form.bgTo}
                    onChange={e => set("bgTo", e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-violet-500"
                    placeholder="#4C1D95"
                  />
                </div>
              </div>
            </div>

            {/* Text color */}
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[11px] text-zinc-500 mb-1.5">Couleur du texte</p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.textColor}
                    onChange={e => set("textColor", e.target.value)}
                    className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-zinc-700 p-0.5"
                  />
                  <input
                    value={form.textColor}
                    onChange={e => set("textColor", e.target.value)}
                    className="w-28 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-violet-500"
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto mt-5">
                <span className="text-xs text-zinc-400">Bannière active</span>
                <button
                  onClick={() => set("isActive", !form.isActive)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${form.isActive ? "bg-violet-600" : "bg-zinc-700"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isActive ? "left-7" : "left-1"}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Order */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-400">Ordre d'affichage</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={e => set("sortOrder", parseInt(e.target.value) || 0)}
              className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-3 border-t border-zinc-800">
          <button
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl border border-zinc-700 text-zinc-400 text-sm font-semibold hover:bg-zinc-800 hover:text-white transition-all"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.title.trim()}
            className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-900/30"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? "Enregistrement..." : "Enregistrer la bannière"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function BannerCard({ banner, idx, total, onEdit, onDelete, onToggle, onMove }: {
  banner: Banner; idx: number; total: number;
  onEdit: () => void; onDelete: () => void; onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const img = banner.imageData || banner.imageUrl;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${banner.isActive ? "border-zinc-700/60" : "border-zinc-800/40 opacity-60"}`}
    >
      {/* Banner preview strip */}
      <div
        className="relative h-28 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${banner.bgFrom}, ${banner.bgTo})` }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        {img && (
          <img src={img} alt={banner.title} className="absolute right-0 bottom-0 h-full object-contain object-right-bottom opacity-90 pointer-events-none" />
        )}
        <div className="relative z-10 p-4 max-w-[65%]">
          <p className="text-base font-extrabold text-white leading-tight truncate">{banner.title}</p>
          {banner.subtitle && <p className="text-xs text-white/75 mt-1 truncate">{banner.subtitle}</p>}
          {banner.linkLabel && (
            <span className="mt-2 inline-block bg-white/20 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white">{banner.linkLabel}</span>
          )}
        </div>
        {!banner.isActive && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <span className="bg-black/70 text-zinc-300 text-xs font-bold px-4 py-1.5 rounded-full border border-zinc-700">Désactivée</span>
          </div>
        )}
        {/* Order badge */}
        <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm text-white/60 text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/10">
          #{idx + 1}
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-1.5 px-3.5 py-3 border-t border-zinc-800">
        {/* Move up/down */}
        <div className="flex gap-0.5">
          <button
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            title="Monter"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            title="Descendre"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Link info */}
        {banner.linkUrl && (
          <div className="flex items-center gap-1 text-[11px] text-zinc-500 flex-1 min-w-0 px-1">
            <LinkIcon className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{banner.linkUrl}</span>
          </div>
        )}
        {!banner.linkUrl && <div className="flex-1" />}

        {/* Toggle active */}
        <button
          onClick={onToggle}
          title={banner.isActive ? "Désactiver" : "Activer"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            banner.isActive
              ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700"
          }`}
        >
          {banner.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {banner.isActive ? "Active" : "Inactive"}
        </button>

        {/* Edit */}
        <button
          onClick={onEdit}
          title="Modifier"
          className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-violet-600/20 hover:border-violet-500/40 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-violet-300 transition-all"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          title="Supprimer"
          className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-red-950/40 hover:border-red-700/40 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function BannersContent() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setBanners(await api<Banner[]>("GET", "/admin/banners")); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function handleSave(form: typeof EMPTY_FORM) {
    setSaving(true);
    try {
      if (editingId) {
        const updated = await api<Banner>("PUT", `/admin/banners/${editingId}`, form);
        setBanners(bs => bs.map(b => b.id === editingId ? updated : b));
        toast({ title: "Bannière mise à jour" });
        setEditingId(null);
      } else {
        const created = await api<Banner>("POST", "/admin/banners", { ...form, sortOrder: banners.length });
        setBanners(bs => [...bs, created]);
        toast({ title: "Bannière créée" });
        setShowCreate(false);
      }
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function toggleActive(b: Banner) {
    try {
      const updated = await api<Banner>("PATCH", `/admin/banners/${b.id}/toggle`);
      setBanners(bs => bs.map(x => x.id === b.id ? updated : x));
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function deleteBanner(id: string) {
    if (!confirm("Supprimer cette bannière définitivement ?")) return;
    try {
      await api("DELETE", `/admin/banners/${id}`);
      setBanners(bs => bs.filter(b => b.id !== id));
      if (editingId === id) setEditingId(null);
      toast({ title: "Bannière supprimée" });
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function moveOrder(id: string, dir: -1 | 1) {
    const idx = banners.findIndex(b => b.id === id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === banners.length - 1)) return;
    const next = [...banners];
    [next[idx], next[idx + dir]] = [next[idx + dir]!, next[idx]!];
    const reordered = next.map((b, i) => ({ ...b, sortOrder: i }));
    setBanners(reordered);
    await api("PATCH", "/admin/banners/reorder", {
      order: reordered.map((b, i) => ({ id: b.id, sortOrder: i })),
    }).catch(() => {});
  }

  const editingBanner = banners.find(b => b.id === editingId);
  const editInitial = editingBanner ? {
    title: editingBanner.title,
    subtitle: editingBanner.subtitle ?? "",
    imageData: "",
    imageUrl: editingBanner.imageUrl ?? "",
    linkUrl: editingBanner.linkUrl ?? "",
    linkLabel: editingBanner.linkLabel ?? "",
    bgFrom: editingBanner.bgFrom,
    bgTo: editingBanner.bgTo,
    textColor: editingBanner.textColor,
    isActive: editingBanner.isActive,
    sortOrder: editingBanner.sortOrder,
  } : EMPTY_FORM;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Bannières</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Gérez les bannières défilantes de la page d'accueil
            {banners.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-500">
                — {banners.filter(b => b.isActive).length}/{banners.length} actives
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setEditingId(null); setShowCreate(v => !v); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            showCreate
              ? "bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700"
              : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30"
          }`}
        >
          {showCreate ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showCreate ? "Annuler" : "Nouvelle bannière"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <BannerEditor
            initial={EMPTY_FORM}
            onSave={handleSave}
            onCancel={() => setShowCreate(false)}
            saving={saving}
            title="Nouvelle bannière"
          />
        )}
      </AnimatePresence>

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
          <Loader2 className="w-7 h-7 animate-spin mb-3" />
          <p className="text-sm">Chargement...</p>
        </div>
      ) : banners.length === 0 && !showCreate ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-zinc-600"
        >
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
            <Image className="w-7 h-7 opacity-40" />
          </div>
          <p className="font-semibold text-zinc-400">Aucune bannière configurée</p>
          <p className="text-sm mt-1 text-zinc-600 text-center max-w-xs">
            Créez votre première bannière pour qu'elle apparaisse sur la page d'accueil.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-violet-900/30"
          >
            <Plus className="w-4 h-4" /> Créer ma première bannière
          </button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {banners.map((banner, idx) => (
              <div key={banner.id}>
                <BannerCard
                  banner={banner}
                  idx={idx}
                  total={banners.length}
                  onEdit={() => { setShowCreate(false); setEditingId(editingId === banner.id ? null : banner.id); }}
                  onDelete={() => deleteBanner(banner.id)}
                  onToggle={() => toggleActive(banner)}
                  onMove={(dir) => moveOrder(banner.id, dir)}
                />
                <AnimatePresence>
                  {editingId === banner.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden mt-2"
                    >
                      <BannerEditor
                        initial={editInitial}
                        onSave={handleSave}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                        title={`Modifier — ${banner.title}`}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Tips */}
      {banners.length > 0 && (
        <p className="text-center text-xs text-zinc-600 pt-2">
          Les bannières s'affichent dans l'ordre défini · Le défilement est automatique toutes les 4,5 s
        </p>
      )}
    </div>
  );
}

export default function AdminBanners() {
  return (
    <AdminGuard>
      <AdminLayout>
        <BannersContent />
      </AdminLayout>
    </AdminGuard>
  );
}
