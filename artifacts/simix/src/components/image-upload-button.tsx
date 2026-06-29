import { useRef, useState, useCallback } from "react";
import { Upload, Loader2, X, Link, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

async function uploadFile(file: File, authHeader?: Record<string, string>): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Veuillez sélectionner une image (PNG, JPG, SVG, WebP).");
  }

  /* ── Phase 1: Try GCS presigned URL ── */
  try {
    const metaRes = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authHeader ?? {}) },
      credentials: "include",
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (metaRes.ok) {
      const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (putRes.ok) return `/api/storage${objectPath}`;
    }
  } catch { /* fall through */ }

  /* ── Phase 2: Direct server upload ── */
  try {
    const directRes = await fetch("/api/storage/uploads/direct", {
      method: "POST",
      headers: { "Content-Type": file.type, ...(authHeader ?? {}) },
      credentials: "include",
      body: file,
    });
    if (directRes.ok) {
      const { url } = await directRes.json() as { url: string };
      return url;
    }
  } catch { /* fall through */ }

  /* ── Phase 3: Base64 fallback ── */
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}

export function useImageUpload(onUploaded: (url: string) => void, authHeader?: Record<string, string>) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadFile(file, authHeader);
      onUploaded(url);
      toast({ title: "Image uploadée ✓", description: "Le logo a été mis à jour." });
    } catch (e) {
      toast({ title: "Upload échoué", description: (e as Error).message || "Vérifiez votre connexion et réessayez.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [onUploaded, authHeader, toast]);

  return { upload, uploading };
}

/* ── Small inline upload button (existing usage) ─────────────────── */
interface Props {
  onUploaded: (url: string) => void;
  busy?: boolean;
  authHeader?: Record<string, string>;
  size?: "sm" | "md";
  label?: string;
}

export function ImageUploadButton({ onUploaded, busy = false, authHeader, size = "sm", label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useImageUpload(onUploaded, authHeader);
  const isWorking = busy || uploading;
  const px = size === "md" ? "px-3 py-2 text-sm" : "px-2 py-1.5 text-xs";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isWorking}
        title="Uploader une image depuis votre appareil"
        className={`flex items-center gap-1.5 ${px} bg-violet-600/20 border border-violet-500/30 text-violet-400 rounded-lg hover:bg-violet-600/30 transition-colors disabled:opacity-50 whitespace-nowrap`}
      >
        {isWorking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        {isWorking ? "Upload…" : (label ?? "Uploader")}
      </button>
    </>
  );
}

/* ── Gallery-first logo upload card ──────────────────────────────── */
interface LogoUploadCardProps {
  value: string;
  onChange: (val: string) => void;
  authHeader?: Record<string, string>;
  busy?: boolean;
  label?: string;
  previewBg?: string;
  placeholder?: string;
}

export function LogoUploadCard({
  value,
  onChange,
  authHeader,
  busy = false,
  label,
  previewBg = "#18181b",
  placeholder = "https://…",
}: LogoUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useImageUpload(onChange, authHeader);
  const [showUrl, setShowUrl] = useState(false);
  const isWorking = busy || uploading;

  const isDataUri = value.startsWith("data:");
  const displayLabel = isDataUri ? "Image uploadée" : value;

  return (
    <div className="space-y-2">
      {label && <label className="block text-xs text-zinc-400 font-medium">{label}</label>}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
      />

      {/* Upload zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !isWorking && inputRef.current?.click()}
        onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !isWorking) inputRef.current?.click(); }}
        className={`relative flex items-center gap-4 px-4 py-3 rounded-xl border-2 border-dashed transition-all cursor-pointer select-none
          ${isWorking
            ? "border-violet-700/40 bg-violet-950/10 cursor-not-allowed"
            : "border-zinc-700 hover:border-violet-500/60 hover:bg-violet-950/10 active:scale-[.99]"
          }`}
      >
        {/* Logo preview */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden border border-zinc-700/60"
          style={{ background: previewBg }}
        >
          {value ? (
            <img
              src={value}
              alt="logo"
              className="w-full h-full object-contain p-1"
              onError={e => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <ImageIcon className="w-5 h-5 text-zinc-600" />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          {isWorking ? (
            <div className="flex items-center gap-2 text-violet-400">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span className="text-sm font-medium">Upload en cours…</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-violet-400 font-medium text-sm">
                <Upload className="w-4 h-4 flex-shrink-0" />
                {value ? "Changer le logo" : "Uploader depuis la galerie"}
              </div>
              {value && !isDataUri && (
                <div className="text-[11px] text-zinc-500 truncate mt-0.5">{displayLabel}</div>
              )}
              {!value && (
                <div className="text-[11px] text-zinc-600 mt-0.5">PNG, JPG, SVG, WebP · 5 Mo max</div>
              )}
            </>
          )}
        </div>

        {/* Clear button */}
        {value && !isWorking && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(""); }}
            title="Supprimer le logo"
            className="flex-shrink-0 p-1 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Optional URL toggle */}
      <button
        type="button"
        onClick={() => setShowUrl(v => !v)}
        className="flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <Link className="w-3 h-3" />
        {showUrl ? "Masquer le champ URL" : "Ou entrer une URL directement"}
      </button>

      {showUrl && (
        <input
          value={isDataUri ? "" : value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-zinc-900/80 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60"
        />
      )}
    </div>
  );
}

/* ── Legacy LogoField (kept for backward compatibility) ───────────── */
interface LogoFieldProps {
  value: string;
  onChange: (val: string) => void;
  authHeader?: Record<string, string>;
  busy?: boolean;
  placeholder?: string;
  label?: string;
  previewBg?: string;
}

export function LogoField({ value, onChange, authHeader, busy, placeholder = "https://…", label, previewBg = "transparent" }: LogoFieldProps) {
  return (
    <LogoUploadCard
      value={value}
      onChange={onChange}
      authHeader={authHeader}
      busy={busy}
      placeholder={placeholder}
      label={label}
      previewBg={previewBg}
    />
  );
}
