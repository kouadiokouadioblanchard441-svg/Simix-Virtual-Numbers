import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { Loader2, Shield } from "lucide-react";
import { isPWA } from "@/lib/pin/pwa-detect";
import {
  clearLegacyPinStorage,
  clearPin,
  clearUnlocked,
  getPinSettings,
  isUnlockedThisSession,
  markUnlocked,
  type PinUser,
} from "@/lib/pin/pin-store";
import { PinLockScreen } from "@/pages/pin/PinLockScreen";
import { PinSetup } from "@/pages/pin/PinSetup";

export type PinStatus =
  | "checking"
  | "no_session"
  | "setup"
  | "locked"
  | "error"
  | "unlocked";

interface PinLockContextValue {
  status: PinStatus;
  currentUser: PinUser | null;
  unlock: () => void;
  forgotPin: () => void;
  pinSetupDone: () => void;
  disablePin: () => void;
  triggerSetup: () => void;
  isPWA: boolean;
}

const PinLockContext = createContext<PinLockContextValue>({
  status: "checking",
  currentUser: null,
  unlock: () => {},
  forgotPin: () => {},
  pinSetupDone: () => {},
  disablePin: () => {},
  triggerSetup: () => {},
  isPWA: false,
});

export function usePinLock() {
  return useContext(PinLockContext);
}

const BYPASS_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/verify-email",
];

export function PinLockProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [status, setStatus] = useState<PinStatus>("checking");
  const [currentUser, setCurrentUser] = useState<PinUser | null>(null);
  const [pwaMode] = useState(() => isPWA());
  const lastUserId = useRef<string | null>(null);
  const { data: apiUser, isLoading, isError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: pwaMode },
  });

  useEffect(() => {
    if (!pwaMode) {
      clearLegacyPinStorage();
      setStatus("unlocked");
      return;
    }
    if (isLoading) {
      setStatus("checking");
      return;
    }
    if (isError || !apiUser) {
      if (lastUserId.current) clearUnlocked(lastUserId.current);
      lastUserId.current = null;
      setCurrentUser(null);
      setStatus("no_session");
      return;
    }

    const user: PinUser = {
      id: (apiUser as any).id,
      fullName: (apiUser as any).fullName || "Utilisateur",
      email: (apiUser as any).email || "",
    };
    if (lastUserId.current && lastUserId.current !== user.id) {
      clearUnlocked(lastUserId.current);
    }
    lastUserId.current = user.id;
    setCurrentUser(user);
    setStatus("checking");

    let active = true;
    void getPinSettings().then((settings) => {
      if (!active) return;
      clearLegacyPinStorage();
      if (!settings.available) {
        // Replit preview does not migrate the Plesk database.
        clearUnlocked(user.id);
        setStatus("unlocked");
      } else if (!settings.pinEnabled) {
        clearUnlocked(user.id);
        setStatus("setup");
      } else if (isUnlockedThisSession(user.id)) {
        setStatus("unlocked");
      } else {
        setStatus("locked");
      }
    }).catch(() => {
      if (active) setStatus("error");
    });
    return () => {
      active = false;
    };
  }, [pwaMode, apiUser, isLoading, isError]);

  useEffect(() => {
    if (!pwaMode) return;
    if (status === "no_session" && !BYPASS_PATHS.includes(location)) {
      setLocation("/login");
    }
  }, [status, location, setLocation, pwaMode]);

  const unlock = useCallback(() => {
    if (currentUser) markUnlocked(currentUser.id);
    setStatus("unlocked");
  }, [currentUser]);

  const pinSetupDone = useCallback(() => {
    if (currentUser) markUnlocked(currentUser.id);
    setStatus("unlocked");
    setLocation("/dashboard");
  }, [currentUser, setLocation]);

  const forgotPin = useCallback(() => {
    if (!currentUser) return;
    void clearPin(currentUser.id).then(() => {
      clearUnlocked(currentUser.id);
      setStatus("setup");
    }).catch(() => setStatus("error"));
  }, [currentUser]);

  const disablePin = useCallback(() => {
    if (currentUser) markUnlocked(currentUser.id);
    setStatus("unlocked");
  }, [currentUser]);

  const triggerSetup = useCallback(() => setStatus("setup"), []);

  const value: PinLockContextValue = {
    status,
    currentUser,
    unlock,
    forgotPin,
    pinSetupDone,
    disablePin,
    triggerSetup,
    isPWA: pwaMode,
  };

  let overlay: ReactNode = null;
  if (pwaMode) {
    if (status === "checking") {
      overlay = (
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Vérification de votre compte...</p>
        </div>
      );
    } else if (status === "no_session" && !BYPASS_PATHS.includes(location)) {
      overlay = (
        <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    } else if (status === "setup" && currentUser) {
      overlay = (
        <PinSetup
          user={currentUser}
          onComplete={pinSetupDone}
        />
      );
    } else if (status === "locked" && currentUser) {
      overlay = <PinLockScreen user={currentUser} onUnlock={unlock} onForgotPin={forgotPin} />;
    } else if (status === "error") {
      overlay = (
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
          <Shield className="w-10 h-10 text-red-400" />
          <p className="text-foreground font-semibold">Vérification de sécurité indisponible</p>
          <p className="text-sm text-muted-foreground">
            Le serveur n’a pas pu vérifier votre PIN. Réessayez sans désactiver la protection.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white"
          >
            Réessayer
          </button>
        </div>
      );
    }
  }

  return (
    <PinLockContext.Provider value={value}>
      {children}
      {overlay}
    </PinLockContext.Provider>
  );
}
