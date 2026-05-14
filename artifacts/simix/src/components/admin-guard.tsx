import { adminToken } from "@/lib/admin-token";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { ShieldOff } from "lucide-react";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!adminToken.isValid()) {
      adminToken.clear();
      setLocation("/admin/secure-login");
    }
  }, [setLocation]);

  if (!adminToken.isValid()) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 gap-4">
        <ShieldOff className="w-12 h-12 text-red-500" />
        <p className="text-white text-lg font-semibold">Accès refusé</p>
        <p className="text-zinc-400 text-sm">Session administrateur invalide ou expirée.</p>
        <button onClick={() => setLocation("/")} className="mt-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors">
          Retour à l'accueil
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
