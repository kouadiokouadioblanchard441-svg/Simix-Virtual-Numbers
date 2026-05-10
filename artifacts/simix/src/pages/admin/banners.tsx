import { useState, useRef, type ChangeEvent } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminGuard } from "@/components/admin-guard";
import { adminToken } from "@/lib/admin-token";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Upload, X, Check, ChevronUp, ChevronDown, Image, Loader2, Eye, EyeOff,
  Link as LinkIcon, Palette,
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

const PRESET_GRADIENTS = [
  { label: "Violet", from: "#7C3AED", to: "#4C1D95" },
  { label: "Orange", from: "#EA580C", to: "#9A3412" },
  { label: "Bleu", from: "#2563EB", to: "#1E3A8A" },
  { label: "Vert", from: "#059669", to: "#064E3B" },
  { label: "Rose", from: "#DB2777", to: "#831843" },
  { label: "Indigo", from: "#4F46E5", to: "#312E81" },
  { label: "Amber", from: "#D97706", to: "#78350F" },
  { label: "Teal", from: "#0D9488", to: "#134E4A" },
];

const EMPTY_FORM = {
  title: "", subtitle: "", imageData: "", imageUrl: "", linkUrl: "", linkLabel: "",
  bgFrom: "#7C3AED", bgTo: "#4C1D95", textColor: "#FFFFFF", isActive: true, sortOrder: 0,
};

function BannerPreview({ form }: { form: typeof EMPTY_FORM & { imageData?: string } }) {
  const img = form.imageData || form.imageUrl;
  return (
    <div
      className="relative w-full h-36 rounded-2xl overflow-hidden flex items-center p-5 shadow-lg"
      style={{ background: `linear-gradient(135deg, ${form.bgFrom}, ${form.bgTo})` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
      {img && (
        <img src={img} alt="preview" className="absolute right-0 bottom-0 h-full object-contain object-right-bottom opacity-90" />
      )}
      <div className="relative z-10 max-w-[60%]">
        <p className="text-xs font-bold mb-1 opacity-70" style={{ color: form.textColor }}>Aperçu</p>
        <p className="text-lg font-extrabold leading-tight" style={{ color: form.textColor }}>
          {form.title || "Titre de la bannière"}
        </p>
        {form.subtitle && (
          <p className="text-xs mt-1 opacity-80" style={{ color: form.textColor }}>{form.subtitle}</p>
        )}
        {form.linkLabel && (
          <div className="mt-2 inline-block bg-white/20 px-3 py-1 rounded-full text-xs font-bold" style={{ color: form.textColor }}>
            {form.linkLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function BannerForm({ initial, onSave, onCancel, saving }: {
  initial: typeof EMPTY_FORM;
  onSave: (form: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function set(k: keyof typeof EMPTY_FORM, v: any) { setForm(f => ({ ...f, [k]: v })); }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      set("imageData", b64);
    } finally { setUploading(false); }
  }

  return (
    <div className="space-y-5">
      <BannerPreview form={form} />

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Titre *</label>
          <input
            value={form.title}
            onChange={e => set("title", e.target.value)}
            placeholder="Ex: Obtenez votre numéro virtuel !"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Sous-titre</label>
          <input
            value={form.subtitle}
            onChange={e => set("subtitle", e.target.value)}
            placeholder="Ex: Disponible dans 20+ pays"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Image (upload)</label>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 border border-zinc-700 hover:border-violet-500 rounded-xl text-sm text-zinc-300 transition-colors"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {form.imageData ? "Changer l'image" : "Téléverser une image"}
            </button>
            {form.imageData && (
              <button onClick={() => set("imageData", "")} className="px-3 py-2.5 bg-red-900/30 border border-red-700/40 rounded-xl text-red-400 hover:bg-red-900/50 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-1.5">URL image externe (optionnel)</label>
          <input
            value={form.imageUrl}
            onChange={e => set("imageUrl", e.target.value)}
            placeholder="https://..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Lien URL</label>
            <input
              value={form.linkUrl}
              onChange={e => set("linkUrl", e.target.value)}
              placeholder="/services"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Texte du bouton</label>
            <input
              value={form.linkLabel}
              onChange={e => set("linkLabel", e.target.value)}
              placeholder="En savoir plus"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {/* Gradient presets */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2">Couleur de fond</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_GRADIENTS.map(g => (
              <button
                key={g.label}
                onClick={() => { set("bgFrom", g.from); set("bgTo", g.to); }}
                title={g.label}
                className="w-8 h-8 rounded-lg border-2 transition-all"
                style={{
                  background: `linear-gradient(135deg, ${g.from}, ${g.to})`,
                  borderColor: form.bgFrom === g.from ? "#fff" : "transparent",
                }}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500 w-16 flex-shrink-0">Début</label>
              <input type="color" value={form.bgFrom} onChange={e => set("bgFrom", e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-zinc-700 p-0.5" />
              <input value={form.bgFrom} onChange={e => set("bgFrom", e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500 w-16 flex-shrink-0">Fin</label>
              <input type="color" value={form.bgTo} onChange={e => set("bgTo", e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-zinc-700 p-0.5" />
              <input value={form.bgTo} onChange={e => set("bgTo", e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Couleur texte</label>
            <input type="color" value={form.textColor} onChange={e => set("textColor", e.target.value)}
              className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border border-zinc-700 p-0.5" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Ordre</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={e => set("sortOrder", parseInt(e.target.value) || 0)}
              className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-zinc-400">Active</span>
            <button
              onClick={() => set("isActive", !form.isActive)}
              className={`w-11 h-6 rounded-full transition-colors ${form.isActive ? "bg-violet-600" : "bg-zinc-700"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${form.isActive ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2 border-t border-zinc-800">
        <button
          onClick={onCancel}
          className="flex-1 h-10 rounded-xl border border-zinc-700 text-zinc-400 text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.title.trim()}
          className="flex-1 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function BannersContent() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const data = await api<Banner[]>("GET", "/admin/banners");
      setBanners(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useState(() => { load(); });

  async function handleSave(form: typeof EMPTY_FORM) {
    setSaving(true);
    try {
      if (editing) {
        const updated = await api<Banner>("PUT", `/admin/banners/${editing.id}`, form);
        setBanners(bs => bs.map(b => b.id === editing.id ? updated : b));
        toast({ title: "Bannière mise à jour" });
      } else {
        const created = await api<Banner>("POST", "/admin/banners", form);
        setBanners(bs => [...bs, created]);
        toast({ title: "Bannière créée" });
      }
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
    if (!confirm("Supprimer cette bannière ?")) return;
    try {
      await api("DELETE", `/admin/banners/${id}`);
      setBanners(bs => bs.filter(b => b.id !== id));
      toast({ title: "Bannière supprimée" });
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function moveOrder(id: string, dir: -1 | 1) {
    const idx = banners.findIndex(b => b.id === id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === banners.length - 1)) return;
    const next = [...banners];
    const swap = idx + dir;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    const reordered = next.map((b, i) => ({ ...b, sortOrder: i }));
    setBanners(reordered);
    await api("PATCH", "/admin/banners/reorder", {
      order: reordered.map((b, i) => ({ id: b.id, sortOrder: i })),
    }).catch(() => {});
  }

  const formInitial = editing
    ? {
        title: editing.title,
        subtitle: editing.subtitle ?? "",
        imageData: "",
        imageUrl: editing.imageUrl ?? "",
        linkUrl: editing.linkUrl ?? "",
        linkLabel: editing.linkLabel ?? "",
        bgFrom: editing.bgFrom,
        bgTo: editing.bgTo,
        textColor: editing.textColor,
        isActive: editing.isActive,
        sortOrder: editing.sortOrder,
      }
    : EMPTY_FORM;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Bannières</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Gérez les bannières défilantes de la page d'accueil</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" /> Nouvelle bannière
          </button>
        )}
      </div>

      {/* Form */}
      {(showForm || editing) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-base font-bold text-white mb-4">{editing ? "Modifier la bannière" : "Nouvelle bannière"}</h2>
          <BannerForm
            initial={formInitial}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            saving={saving}
          />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
        </div>
      ) : banners.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Image className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Aucune bannière configurée</p>
          <p className="text-sm mt-1">Créez votre première bannière pour l'afficher sur l'accueil.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((banner, idx) => {
            const img = banner.imageData || banner.imageUrl;
            return (
              <div key={banner.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                {/* Preview strip */}
                <div
                  className="relative h-24 flex items-center px-5"
                  style={{ background: `linear-gradient(135deg, ${banner.bgFrom}, ${banner.bgTo})` }}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_60%)]" />
                  {img && (
                    <img src={img} alt={banner.title} className="absolute right-0 bottom-0 h-full object-contain object-right-bottom opacity-90" />
                  )}
                  <div className="relative z-10 max-w-[65%]">
                    <p className="text-base font-extrabold text-white leading-tight truncate">{banner.title}</p>
                    {banner.subtitle && <p className="text-xs text-white/70 mt-0.5 truncate">{banner.subtitle}</p>}
                    {banner.linkLabel && (
                      <span className="mt-1 inline-block bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold text-white">{banner.linkLabel}</span>
                    )}
                  </div>
                  {!banner.isActive && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="bg-black/60 text-zinc-300 text-xs font-bold px-3 py-1 rounded-full">Désactivée</span>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveOrder(banner.id, -1)} disabled={idx === 0}
                      className="w-6 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-white disabled:opacity-20 transition-colors">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveOrder(banner.id, 1)} disabled={idx === banners.length - 1}
                      className="w-6 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-white disabled:opacity-20 transition-colors">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 flex items-center gap-1.5 text-xs text-zinc-500">
                    {banner.linkUrl && (
                      <span className="flex items-center gap-1"><LinkIcon className="w-3 h-3" />{banner.linkUrl}</span>
                    )}
                  </div>

                  <button
                    onClick={() => toggleActive(banner)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      banner.isActive ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {banner.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {banner.isActive ? "Active" : "Inactive"}
                  </button>

                  <button
                    onClick={() => { setEditing(banner); setShowForm(false); }}
                    className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => deleteBanner(banner.id)}
                    className="w-8 h-8 rounded-xl bg-red-900/20 hover:bg-red-900/40 flex items-center justify-center text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
