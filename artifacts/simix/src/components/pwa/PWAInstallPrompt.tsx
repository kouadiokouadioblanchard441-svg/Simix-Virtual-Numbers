import { useState, useEffect } from "react";
import { usePWAInstallContext } from "@/context/PWAInstallContext";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "simix_install_dismissed";

export function PWAInstallPrompt() {
  const { canInstall, isInstalled, isStandalone, promptInstall } = usePWAInstallContext();
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISSED_KEY) === "true";
    setDismissed(wasDismissed);
  }, []);

  useEffect(() => {
    if (canInstall && !dismissed && !isInstalled && !isStandalone) {
      const timer = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(timer);
    }
  }, [canInstall, dismissed, isInstalled, isStandalone]);

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, "true");
  };

  const handleInstall = async () => {
    await promptInstall();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9998] w-[calc(100%-2rem)] max-w-sm"
      role="dialog"
      aria-label="Installer SIMIX"
    >
      <div className="bg-zinc-900 border border-violet-800/40 rounded-2xl shadow-2xl shadow-violet-900/30 overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-violet-600 to-cyan-400" />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-violet-900 flex items-center justify-center shrink-0">
              <img src="/icons/icon-72x72.png" alt="SIMIX" className="w-8 h-8 rounded-lg" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Installer SIMIX</p>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Accédez à SIMIX comme une app native — rapide, hors-ligne et sans navigateur.
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors mt-0.5 shrink-0"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
            >
              Pas maintenant
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Installer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
