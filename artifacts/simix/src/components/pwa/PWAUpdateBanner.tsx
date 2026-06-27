import { usePWAUpdate } from "@/hooks/usePWA";
import { X, RefreshCw } from "lucide-react";

export function PWAUpdateBanner() {
  const { needRefresh, offlineReady, updateSW, close } = usePWAUpdate();

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm"
      role="alertdialog"
      aria-label="Mise à jour disponible"
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center shrink-0">
          <RefreshCw className="w-5 h-5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          {needRefresh ? (
            <>
              <p className="text-sm font-semibold text-white">Mise à jour disponible</p>
              <p className="text-xs text-zinc-400 mt-0.5">Une nouvelle version de SIMIX est prête.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-white">Prêt hors-ligne</p>
              <p className="text-xs text-zinc-400 mt-0.5">SIMIX fonctionne maintenant sans connexion.</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {needRefresh && (
            <button
              onClick={() => updateSW(true)}
              className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors px-2 py-1"
            >
              Mettre à jour
            </button>
          )}
          <button
            onClick={close}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
