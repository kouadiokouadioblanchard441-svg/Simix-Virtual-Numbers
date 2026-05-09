import { useState, useRef, type ChangeEvent } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { adminToken } from "@/lib/admin-token";
import {
  Share2, Globe, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Upload, Link, X, Check, ChevronUp, ChevronDown, Image, Loader2,
} from "lucide-react";
import { FaTelegram, FaWhatsapp, FaFacebook, FaTwitter, FaInstagram, FaYoutube, FaTiktok, FaLinkedin, FaDiscord } from "react-icons/fa";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── Social icon map ─── */
const SOCIAL_ICON_MAP: Record<string, { Icon: React.ElementType; color: string; label: string }> = {
  telegram: { Icon: FaTelegram, color: "#2AABEE", label: "Telegram" },
  whatsapp: { Icon: FaWhatsapp, color: "#25D366", label: "WhatsApp" },
  facebook: { Icon: FaFacebook, color: "#1877F2", label: "Facebook" },
  twitter: { Icon: FaTwitter, color: "#1DA1F2", label: "Twitter / X" },
  instagram: { Icon: FaInstagram, color: "#E1306C", label: "Instagram" },
  youtube: { Icon: FaYoutube, color: "#FF0000", label: "YouTube" },
  tiktok: { Icon: FaTiktok, color: "#FF0050", label: "TikTok" },
  linkedin: { Icon: FaLinkedin, color: "#0A66C2", label: "LinkedIn" },
  discord: { Icon: FaDiscord, color: "#5865F2", label: "Discord" },
};

/* ─── API helpers ─── */
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...adminToken.getHeader(), "content-type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error((e as { error: string }).error); }
  return res.json() as Promise<T>;
}

/* ─── Types ─── */
interface SocialLink { id: string; platform: string; name: string; url: string; color: string; isActive: boolean; sortOrder: number }
interface PaymentOperator { id: string; name: string; logoUrl: string | null; logoData: string | null; websiteUrl: string | null; countries: string | null; bgColor: string; isActive: boolean; sortOrder: number }

/* ─── Image to base64 ─── */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ─────────────────────────────────── SOCIAL LINKS TAB ─── */
function SocialLinksTab() {
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SocialLink | null>(null);
  const [form, setForm] = useState({ platform: "telegram", name: "", url: "", color: "#8B5CF6" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try { const d = await api<{ links: SocialLink[] }>("GET", "/admin/social-links"); setLinks(d.links); }
    catch { /* ignore */ }
    setLoading(false);
  };

  useState(() => { void load(); });

  const openNew = () => { setEditing(null); setForm({ platform: "telegram", name: "", url: "", color: "#8B5CF6" }); setShowForm(true); };
  const openEdit = (l: SocialLink) => { setEditing(l); setForm({ platform: l.platform, name: l.name, url: l.url, color: l.color }); setShowForm(true); };

  const save = async () => {
    if (!form.name || !form.url) { setError("Nom et URL requis"); return; }
    setSaving(true); setError("");
    try {
      const platform = form.platform.toLowerCase().trim();
      const iconInfo = SOCIAL_ICON_MAP[platform];
      const color = iconInfo?.color ?? form.color;
      if (editing) {
        await api("PUT", `/admin/social-links/${editing.id}`, { ...form, platform, color });
      } else {
        await api("POST", "/admin/social-links", { ...form, platform, color });
      }
      setShowForm(false); await load();
    } catch (e) { setError(String((e as Error).message)); }
    setSaving(false);
  };

  const toggle = async (l: SocialLink) => {
    await api("PUT", `/admin/social-links/${l.id}`, { isActive: !l.isActive });
    await load();
  };

  const del = async (id: string) => {
    if (!confirm("Supprimer ce réseau social ?")) return;
    await api("DELETE", `/admin/social-links/${id}`);
    await load();
  };

  const reorder = async (idx: number, dir: -1 | 1) => {
    const next = [...links];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    await Promise.all(next.map((l, i) => api("PUT", `/admin/social-links/${l.id}`, { sortOrder: i })));
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Réseaux Sociaux</h2>
          <p className="text-zinc-400 text-sm mt-0.5">Liens affichés dans le footer de la page vitrine</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-medium text-sm">{editing ? "Modifier" : "Nouveau réseau social"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Plateforme</label>
              <select
                value={form.platform}
                onChange={e => {
                  const p = e.target.value;
                  const info = SOCIAL_ICON_MAP[p];
                  setForm(f => ({ ...f, platform: p, name: info?.label ?? p, color: info?.color ?? f.color }));
                }}
                className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/60"
              >
                {Object.entries(SOCIAL_ICON_MAP).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
                <option value="custom">Autre / Custom</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Nom affiché</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/60"
                placeholder="Ex: WhatsApp Officiel" />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">URL du lien</label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/60"
              placeholder="https://t.me/simixafrica" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editing ? "Enregistrer" : "Ajouter"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : links.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <Share2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun réseau social configuré</p>
          <p className="text-xs mt-1">Ajoutez vos liens Telegram, WhatsApp, Facebook…</p>
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((l, idx) => {
            const iconInfo = SOCIAL_ICON_MAP[l.platform];
            const Icon = iconInfo?.Icon ?? Share2;
            const iconColor = iconInfo?.color ?? l.color ?? "#8B5CF6";
            return (
              <div key={l.id} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${l.isActive ? "bg-zinc-900 border-zinc-700/60" : "bg-zinc-950 border-zinc-800/40 opacity-60"}`}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}30` }}>
                  <Icon size={20} style={{ color: iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium">{l.name}</div>
                  <div className="text-zinc-500 text-xs truncate">{l.url}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => reorder(idx, -1)} disabled={idx === 0} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-500 disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => reorder(idx, 1)} disabled={idx === links.length - 1} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-500 disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggle(l)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800">
                    {l.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-zinc-500" />}
                  </button>
                  <button onClick={() => openEdit(l)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => del(l.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-950/40 text-zinc-500 hover:text-red-400">
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

/* ─────────────────────────────── PAYMENT OPERATORS TAB ─── */
function PaymentOperatorsTab() {
  const [operators, setOperators] = useState<PaymentOperator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentOperator | null>(null);
  const [form, setForm] = useState({ name: "", logoUrl: "", websiteUrl: "", countries: "", bgColor: "#1a1a2e" });
  const [logoData, setLogoData] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try { const d = await api<{ operators: PaymentOperator[] }>("GET", "/admin/payment-operators"); setOperators(d.operators); }
    catch { /* ignore */ }
    setLoading(false);
  };

  useState(() => { void load(); });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", logoUrl: "", websiteUrl: "", countries: "", bgColor: "#1a1a2e" });
    setLogoData(null); setLogoPreview(null); setShowForm(true);
  };

  const openEdit = (op: PaymentOperator) => {
    setEditing(op);
    setForm({ name: op.name, logoUrl: op.logoUrl ?? "", websiteUrl: op.websiteUrl ?? "", countries: op.countries ?? "", bgColor: op.bgColor });
    setLogoData(op.logoData ?? null);
    setLogoPreview(op.logoData ?? op.logoUrl ?? null);
    setShowForm(true);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) { setError("Logo trop grand — max 300 KB"); return; }
    const b64 = await fileToBase64(file);
    setLogoData(b64); setLogoPreview(b64);
  };

  const save = async () => {
    if (!form.name) { setError("Nom requis"); return; }
    setSaving(true); setError("");
    try {
      const payload = { ...form, logoData: logoData ?? null, logoUrl: form.logoUrl || null };
      if (editing) { await api("PUT", `/admin/payment-operators/${editing.id}`, payload); }
      else { await api("POST", "/admin/payment-operators", payload); }
      setShowForm(false); await load();
    } catch (e) { setError(String((e as Error).message)); }
    setSaving(false);
  };

  const toggle = async (op: PaymentOperator) => {
    await api("PUT", `/admin/payment-operators/${op.id}`, { isActive: !op.isActive });
    await load();
  };

  const del = async (id: string) => {
    if (!confirm("Supprimer cet opérateur ?")) return;
    await api("DELETE", `/admin/payment-operators/${id}`);
    await load();
  };

  const reorder = async (idx: number, dir: -1 | 1) => {
    const next = [...operators];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    await Promise.all(next.map((op, i) => api("PUT", `/admin/payment-operators/${op.id}`, { sortOrder: i })));
    await load();
  };

  const getLogoSrc = (op: PaymentOperator) => op.logoData ?? op.logoUrl ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Opérateurs & Partenaires</h2>
          <p className="text-zinc-400 text-sm mt-0.5">Logos affichés dans le footer et le ticker de la vitrine</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-medium text-sm">{editing ? "Modifier l'opérateur" : "Nouvel opérateur"}</h3>

          {/* Logo upload */}
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider mb-2 block">Logo</label>
            <div className="flex items-start gap-4">
              <div
                className="w-20 h-20 rounded-xl border-2 border-dashed border-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer hover:border-violet-500/50 transition-colors"
                style={{ background: form.bgColor }}
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="text-center">
                    <Image className="w-6 h-6 text-zinc-600 mx-auto mb-1" />
                    <span className="text-[10px] text-zinc-600">Cliquer</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition-colors w-full justify-center">
                  <Upload className="w-3.5 h-3.5" /> Uploader une image
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <div className="text-zinc-600 text-center text-[10px]">— ou —</div>
                <div className="relative">
                  <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input value={form.logoUrl} onChange={e => { setForm(f => ({ ...f, logoUrl: e.target.value })); if (!logoData) setLogoPreview(e.target.value); }}
                    className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg pl-8 pr-3 py-2 text-white text-xs focus:outline-none focus:border-violet-500/60"
                    placeholder="https://... URL du logo" />
                </div>
                {logoPreview && (
                  <button onClick={() => { setLogoData(null); setLogoPreview(null); setForm(f => ({ ...f, logoUrl: "" })); }}
                    className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs">
                    <X className="w-3 h-3" /> Supprimer le logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Nom</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/60"
                placeholder="Orange Money" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Couleur de fond</label>
              <div className="flex gap-2">
                <input type="color" value={form.bgColor} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-zinc-700 cursor-pointer bg-zinc-800 p-1" />
                <input value={form.bgColor} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))}
                  className="flex-1 bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/60"
                  placeholder="#1a1a2e" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Pays couverts</label>
              <input value={form.countries} onChange={e => setForm(f => ({ ...f, countries: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/60"
                placeholder="CI · SN · ML · BF" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Site web (optionnel)</label>
              <input value={form.websiteUrl} onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/60"
                placeholder="https://orange.com" />
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editing ? "Enregistrer" : "Ajouter"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Operators grid */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : operators.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun opérateur configuré</p>
          <p className="text-xs mt-1">Ajoutez Orange Money, MTN, Wave…</p>
        </div>
      ) : (
        <div className="space-y-2">
          {operators.map((op, idx) => {
            const logoSrc = getLogoSrc(op);
            return (
              <div key={op.id} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${op.isActive ? "bg-zinc-900 border-zinc-700/60" : "bg-zinc-950 border-zinc-800/40 opacity-60"}`}>
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: op.bgColor }}>
                  {logoSrc ? (
                    <img src={logoSrc} alt={op.name} className="w-full h-full object-contain p-1.5" />
                  ) : (
                    <span className="text-white text-xs font-bold">{op.name.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium">{op.name}</div>
                  {op.countries && <div className="text-zinc-500 text-xs truncate">{op.countries}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => reorder(idx, -1)} disabled={idx === 0} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-500 disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => reorder(idx, 1)} disabled={idx === operators.length - 1} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-500 disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggle(op)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800">
                    {op.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-zinc-500" />}
                  </button>
                  <button onClick={() => openEdit(op)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => del(op.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-950/40 text-zinc-500 hover:text-red-400">
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

/* ─────────────────────────────────── MAIN PAGE ─── */
export default function AdminFooter() {
  const [tab, setTab] = useState<"social" | "operators">("social");

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Footer & Vitrine</h1>
          <p className="text-zinc-400 text-sm mt-1">Gérez les réseaux sociaux et les opérateurs de paiement affichés sur la page vitrine.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-zinc-900 rounded-xl w-fit">
          {[
            { key: "social", label: "Réseaux Sociaux", icon: Share2 },
            { key: "operators", label: "Opérateurs & Partenaires", icon: Globe },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-6">
          {tab === "social" ? <SocialLinksTab /> : <PaymentOperatorsTab />}
        </div>
      </div>
    </AdminLayout>
  );
}
