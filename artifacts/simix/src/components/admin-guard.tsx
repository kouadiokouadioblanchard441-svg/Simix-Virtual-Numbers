import { useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2, ShieldOff } from "lucide-react";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetMe();

  useEffect(() => {
    if (isError) setLocation("/login");
  }, [isError, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (!user.isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 gap-4">
        <ShieldOff className="w-12 h-12 text-red-500" />
        <p className="text-white text-lg font-semibold">Accès refusé</p>
        <p className="text-zinc-400 text-sm">Vous n'avez pas les droits administrateur.</p>
        <button onClick={() => setLocation("/dashboard")} className="mt-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors">
          Retour au tableau de bord
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
