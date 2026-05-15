import { useRef, useState, useCallback } from "react";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function useImageUpload(onUploaded: (url: string) => void, authHeader?: Record<string, string>) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const upload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Fichier invalide", description: "Veuillez sélectionner une image (PNG, JPG, SVG, WebP).", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeader ?? {}) },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) throw new Error("Impossible d'obtenir l'URL d'upload");
      const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Upload échoué");
      const serveUrl = `/api/storage${objectPath}`;
      onUploaded(serveUrl);
      toast({ title: "Image uploadée ✓", description: "Le logo a été mis à jour." });
    } catch (e) {
      toast({ title: "Image non uploadée", description: (e as Error).message || "L'upload a échoué. Vérifiez votre connexion et réessayez.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [onUploaded, authHeader, toast]);

  return { upload, uploading };
}

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
    <div className="space-y-1.5">
      {label && <label className="block text-xs text-zinc-400 font-medium">{label}</label>}
      <div className="flex gap-2 items-center">
        <div className="w-9 h-9 rounded-lg border border-zinc-700/60 flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{ background: previewBg }}>
          {value ? (
            <img src={value} alt="logo" className="w-full h-full object-contain p-0.5" onError={e => (e.currentTarget.style.display = "none")} />
          ) : (
            <div className="w-4 h-4 rounded bg-zinc-700" />
          )}
        </div>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60 min-w-0"
        />
        <ImageUploadButton onUploaded={onChange} authHeader={authHeader} busy={busy} label="Fichier" />
      </div>
    </div>
  );
}
