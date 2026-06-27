import { useOnlineStatus } from "@/hooks/usePWA";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShow(true);
    } else {
      const timer = setTimeout(() => setShow(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!show) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 text-xs font-semibold transition-all duration-300 ${
        isOnline
          ? "bg-emerald-600 text-white"
          : "bg-red-600 text-white"
      }`}
      role="status"
      aria-live="polite"
    >
      <WifiOff className="w-3.5 h-3.5" />
      {isOnline ? "Connexion rétablie" : "Vous êtes hors ligne"}
    </div>
  );
}
