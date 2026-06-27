import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { isPWA } from "@/lib/pin/pwa-detect";
import {
  hasPinSetup,
  isUnlockedThisSession,
  markUnlocked,
  clearUnlocked,
  savePinUser,
  getPinUser,
  updateLastActive,
  clearPin,
  type PinUser,
} from "@/lib/pin/pin-store";
import { PinLockScreen } from "@/pages/pin/PinLockScreen";
import { PinSetup } from "@/pages/pin/PinSetup";
import { Loader2 } from "lucide-react";

// Routes that bypass PIN lock entirely
const BYPASS_PATHS = [
  "/console",
  "/admin-login",
  "/admin/secure-login",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

type PinStatus =
  | "checking"    // Initial load, waiting for auth
  | "skipped"     // Not in PWA mode
  | "no_session"  // No valid server session
  | "setup"       // Session OK, no PIN created yet
  | "locked"      // Session OK, PIN exists, not unlocked
  | "unlocked";   // Session OK, PIN verified this session

interface PinLockContextValue {
  status: PinStatus;
  currentUser: PinUser | null;
  unlock: () => void;
  pinSetupDone: () => void;
  forgotPin: () => void;
  disablePin: () => void;
  triggerSetup: () => void;
}

const PinLockContext = createContext<PinLockContextValue | null>(null);

export function usePinLock(): PinLockContextValue {
  const ctx = useContext(PinLockContext);
  if (!ctx) throw new Error("usePinLock must be used inside PinLockProvider");
  return ctx;
}

export function PinLockProvider({ children }: { children: ReactNode }) {
  const [pwaMode] = useState(() => isPWA());
  const [status, setStatus] = useState<PinStatus>(pwaMode ? "checking" : "skipped");
  const [currentUser, setCurrentUser] = useState<PinUser | null>(null);
  const [location, setLocation] = useLocation();

  const { data: apiUser, isLoading, isError } = useGetMe();

  // Compute effective status based on auth + pin state
  useEffect(() => {
    if (!pwaMode) return; // non-PWA never enters PIN flow

    if (isLoading) {
      setStatus("checking");
      return;
    }

    if (isError || !apiUser) {
      setStatus("no_session");
      return;
    }

    const user: PinUser = {
      id: (apiUser as any).id,
      fullName: (apiUser as any).fullName || "Utilisateur",
      email: (apiUser as any).email || "",
    };
    savePinUser(user);
    setCurrentUser(user);
    updateLastActive();

    // Already unlocked this app session (e.g. hot-reload)
    if (isUnlockedThisSession()) {
      setStatus("unlocked");
      return;
    }

    if (!hasPinSetup(user.id)) {
      setStatus("setup");
    } else {
      setStatus("locked");
    }
  }, [pwaMode, apiUser, isLoading, isError]);

  // In PWA mode with no session, redirect to /login
  useEffect(() => {
    if (pwaMode && status === "no_session") {
      const isOnAuth = BYPASS_PATHS.some((p) => location.startsWith(p));
      if (!isOnAuth) {
        setLocation("/login");
      }
    }
  }, [pwaMode, status, location, setLocation]);

  const unlock = useCallback(() => {
    markUnlocked();
    setStatus("unlocked");
  }, []);

  const pinSetupDone = useCallback(() => {
    markUnlocked();
    setStatus("unlocked");
    setLocation("/dashboard");
  }, [setLocation]);

  const forgotPin = useCallback(() => {
    if (currentUser) clearPin(currentUser.id);
    clearUnlocked();
    setStatus("no_session");
    setLocation("/login");
  }, [currentUser, setLocation]);

  const disablePin = useCallback(() => {
    if (currentUser) clearPin(currentUser.id);
    markUnlocked(); // keep current session unlocked
    setStatus("unlocked");
  }, [currentUser]);

  const triggerSetup = useCallback(() => {
    setStatus("setup");
  }, []);

  const value: PinLockContextValue = {
    status,
    currentUser: currentUser ?? getPinUser(),
    unlock,
    pinSetupDone,
    forgotPin,
    disablePin,
    triggerSetup,
  };

  // Check if current path bypasses PIN
  const shouldBypass = BYPASS_PATHS.some((p) => location.startsWith(p));

  // Render logic
  let overlay: ReactNode = null;

  if (pwaMode && !shouldBypass) {
    if (status === "checking") {
      overlay = (
        <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      );
    } else if (status === "setup" && value.currentUser) {
      overlay = (
        <div className="fixed inset-0 z-[9999]">
          <PinSetup user={value.currentUser} onComplete={pinSetupDone} />
        </div>
      );
    } else if (status === "locked" && value.currentUser) {
      overlay = (
        <div className="fixed inset-0 z-[9999]">
          <PinLockScreen
            user={value.currentUser}
            onUnlock={unlock}
            onForgotPin={forgotPin}
          />
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
