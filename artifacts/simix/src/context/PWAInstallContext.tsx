import { createContext, useContext, useEffect, useRef, useState } from "react";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

interface PWAInstallContextValue {
  canInstall: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

const PWAInstallContext = createContext<PWAInstallContextValue>({
  canInstall: false,
  isInstalled: false,
  isStandalone: false,
  promptInstall: async () => "unavailable",
});

export function PWAInstallProvider({ children }: { children: React.ReactNode }) {
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

  useEffect(() => {
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as InstallPromptEvent;
      setCanInstall(true);
    };

    const installedHandler = () => {
      deferredPrompt.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [isStandalone]);

  const promptInstall = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt.current) return "unavailable";
    const prompt = deferredPrompt.current;
    deferredPrompt.current = null;
    setCanInstall(false);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
    } else {
      deferredPrompt.current = null;
    }
    return choice.outcome;
  };

  return (
    <PWAInstallContext.Provider value={{ canInstall, isInstalled, isStandalone, promptInstall }}>
      {children}
    </PWAInstallContext.Provider>
  );
}

export function usePWAInstallContext() {
  return useContext(PWAInstallContext);
}
