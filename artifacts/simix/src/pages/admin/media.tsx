import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminGuard } from "@/components/admin-guard";
import { adminToken } from "@/lib/admin-token";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Check, Loader2, AlertCircle, RefreshCw, Image as ImageIcon, X, Info } from "lucide-react";
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Vitrine Icon Definitions ───────────────────────────── */
const FEATURE_ICONS: { key: string; label: string; description: string; defaultSrc: string }[] = [
  { key: "content_icon_lock",      label: "Cadenas (Sécurité)",    description: "Section sécurité — Chiffrement bout en bout", defaultSrc: "/3d/icon-lock.png" },
  { key: "content_icon_eye",       label: "Œil (Éphémère)",        description: "Section sécurité — Numéros éphémères",         defaultSrc: "/3d/icon-eye.png" },
  { key: "content_icon_shield",    label: "Bouclier (Protection)", description: "Section sécurité — Aucune carte bancaire",      defaultSrc: "/3d/icon-shield.png" },
  { key: "content_icon_refresh",   label: "Rechargement",          description: "Section sécurité — Remboursement garanti",     defaultSrc: "/3d/icon-refresh.png" },
  { key: "content_icon_clock",     label: "Horloge (24h/24)",      description: "Section sécurité — Disponible 24h/24",         defaultSrc: "/3d/icon-clock.png" },
  { key: "content_icon_check",     label: "Coche (Vérifié)",       description: "Section sécurité — Numéros vérifiés actifs",   defaultSrc: "/3d/icon-check.png" },
  { key: "content_icon_lightning", label: "Éclair (Instantané)",   description: "Utilisé dans les étapes / livraison rapide",   defaultSrc: "/3d/icon-lightning.png" },
];

const GENERAL_IMAGES: { key: string; label: string; description: string; defaultSrc: string }[] = [
  { key: "content_img_rocket",        label: "Fusée",            description: "Illustration principale Hero / bannière",          defaultSrc: "/3d/rocket.png" },
  { key: "content_img_sms",           label: "SMS / Téléphone",  description: "Section étapes — réception du SMS",                defaultSrc: "/3d/sms.png" },
  { key: "content_img_secure",        label: "Sécurisé",         description: "Section avantages — paiement sécurisé",            defaultSrc: "/3d/secure.png" },
  { key: "content_img_mobile_money",  label: "Mobile Money",     description: "Section paiement — Mobile Money africain",         defaultSrc: "/3d/mobile-money.png" },
  { key: "content_img_africa",        label: "Afrique",          description: "Carte Afrique — couverture géographique",          defaultSrc: "/3d/africa.png" },
  { key: "content_img_step_globe",    label: "Globe (Étape 1)",  description: "Icône étape 1 — choisir pays/service",             defaultSrc: "/3d/step-globe.png" },
  { key: "content_img_step_payment",  label: "Paiement (Étape 2)", description: "Icône étape 2 — payer avec Mobile Money",        defaultSrc: "/3d/step-payment.png" },
  { key: "content_img_step_phone",    label: "Téléphone (Étape 3)", description: "Icône étape 3 — recevoir le numéro",            defaultSrc: "/3d/step-phone.png" },
];

interface IconCardProps {
  label: string;
  description: string;
  defaultSrc: string;
  customSrc: string;
  onUpload: (b64: string) => void;
  onReset: () => void;
  saving: boolean;
}

function IconCard({ label, description, defaultSrc, customSrc, onUpload, onReset, saving }: IconCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

  const displaySrc = preview || customSrc || (BASE_URL + defaultSrc);
  const isCustom = !!customSrc;

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("L'image ne doit pas dépasser 2 Mo.");
      return;
    }
    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      setPreview(b64);
      onUpload(b64);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${isCustom ? "border-violet-600/40" : "border-zinc-800"}`}
    >
      <div className="flex items-center gap-4 p-4">
        {/* Image preview */}
        <div className="w-16 h-16 rounded-xl bg-zinc-800/60 flex items-center justify-center flex-shrink-0 overflow-hidden border border-zinc-700/40">
          {displaySrc ? (
            <img src={displaySrc} alt={label} className="w-full h-full object-contain p-1" />
          ) : (
            <ImageIcon className="w-6 h-6 text-zinc-600" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-white truncate">{label}</p>
            {isCustom && (
              <span className="flex-shrink-0 text-[10px] font-bold bg-violet-500/20 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full">
                Personnalisée
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">{description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isCustom && (
            <button
              onClick={() => { setPreview(null); onReset(); }}
              disabled={saving}
              title="Rétablir l'image par défaut"
              className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-red-950/40 border border-zinc-700 hover:border-red-700/40 flex items-center justify-center text-zinc-400 hover:text-red-400 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || saving}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-violet-600/20 border border-zinc-700 hover:border-violet-500/50 rounded-xl text-xs text-zinc-300 hover:text-violet-300 font-semibold transition-all disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {isCustom ? "Changer" : "Importer"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MediaContent() {
  const [content, setContent] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api<Record<string, string>>("GET", "/admin/site-content");
      setContent(data);
      setPending({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleUpload(key: string, b64: string) {
    setPending(p => ({ ...p, [key]: b64 }));
  }

  function handleReset(key: string) {
    setPending(p => ({ ...p, [key]: "" }));
    setContent(c => { const next = { ...c }; delete next[key]; return next; });
  }

  const hasPending = Object.keys(pending).length > 0;

  async function saveAll() {
    if (!hasPending) return;
    setSaving(true);
    try {
      await api("PUT", "/admin/site-content", pending);
      setContent(c => ({ ...c, ...pending }));
      setPending({});
      toast({ title: "Images mises à jour", description: "Les nouvelles images sont actives sur la vitrine." });
    } catch (e) {
      toast({ title: "Images non sauvegardées", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function getImageSrc(key: string): string {
    return pending[key] ?? content[key] ?? "";
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-zinc-600">
        <Loader2 className="w-7 h-7 animate-spin mb-3" />
        <p className="text-sm">Chargement des médias...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Médias & Icônes</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Personnalisez les images et icônes affichées sur la page vitrine</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {hasPending && (
            <button
              onClick={saveAll}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-violet-900/30 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Enregistrement..." : `Enregistrer (${Object.keys(pending).length})`}
            </button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-950/30 border border-blue-800/30 rounded-xl px-4 py-3 text-sm text-blue-300">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Images PNG recommandées, fond transparent, max 2 Mo</p>
          <p className="text-xs text-blue-400/70 mt-0.5">Les images par défaut restent utilisées si aucune personnalisation n'est définie. Cliquez sur "Enregistrer" pour appliquer les modifications.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Pending indicator */}
      <AnimatePresence>
        {hasPending && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-between bg-amber-950/30 border border-amber-700/40 rounded-xl px-4 py-3"
          >
            <div className="flex items-center gap-2 text-sm text-amber-300">
              <AlertCircle className="w-4 h-4" />
              <span><strong>{Object.keys(pending).length}</strong> modification{Object.keys(pending).length > 1 ? "s" : ""} non enregistrée{Object.keys(pending).length > 1 ? "s" : ""}</span>
            </div>
            <button
              onClick={saveAll}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Enregistrer maintenant
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feature icons section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-0.5 bg-violet-600 rounded-full" />
          <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Icônes de sécurité</h2>
        </div>
        <div className="space-y-3">
          {FEATURE_ICONS.map(icon => (
            <IconCard
              key={icon.key}
              label={icon.label}
              description={icon.description}
              defaultSrc={icon.defaultSrc}
              customSrc={getImageSrc(icon.key)}
              onUpload={(b64) => handleUpload(icon.key, b64)}
              onReset={() => handleReset(icon.key)}
              saving={saving}
            />
          ))}
        </div>
      </section>

      {/* General images section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-0.5 bg-violet-600 rounded-full" />
          <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Illustrations générales</h2>
        </div>
        <div className="space-y-3">
          {GENERAL_IMAGES.map(img => (
            <IconCard
              key={img.key}
              label={img.label}
              description={img.description}
              defaultSrc={img.defaultSrc}
              customSrc={getImageSrc(img.key)}
              onUpload={(b64) => handleUpload(img.key, b64)}
              onReset={() => handleReset(img.key)}
              saving={saving}
            />
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-zinc-600 pt-2">
        Les modifications sont appliquées immédiatement après enregistrement
      </p>
    </div>
  );
}

export default function AdminMedia() {
  return (
    <AdminGuard>
      <AdminLayout>
        <MediaContent />
      </AdminLayout>
    </AdminGuard>
  );
}
