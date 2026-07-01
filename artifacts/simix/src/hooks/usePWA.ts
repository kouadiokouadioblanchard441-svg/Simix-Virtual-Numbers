import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export interface PWAState {
  needRefresh: boolean;
  offlineReady: boolean;
  updateSW: (reloadPage?: boolean) => Promise<void>;
  close: () => void;
}

export function usePWAUpdate(): PWAState {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error("[SW] Registration error:", error);
    },
  });

  return {
    needRefresh,
    offlineReady,
    updateSW: updateServiceWorker,
    close: () => {
      setNeedRefresh(false);
      setOfflineReady(false);
    },
  };
}

export type { InstallPromptEvent } from "@/context/PWAInstallContext";
export { usePWAInstallContext as usePWAInstall } from "@/context/PWAInstallContext";

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return isOnline;
}
