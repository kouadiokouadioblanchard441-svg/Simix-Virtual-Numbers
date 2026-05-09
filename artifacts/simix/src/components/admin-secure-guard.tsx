/**
 * AdminSecureGuard — JWT-based guard for all admin routes.
 * Requires both a valid admin JWT (sessionStorage) AND the user's
 * regular session cookie to be a confirmed admin.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Shield, Loader2 } from "lucide-react";
import { adminToken } from "@/lib/admin-token";
import { useGetMe } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function verifyJwtSession(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/admin-auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as { valid?: boolean };
    return data.valid === true;
  } catch {
    return false;
  }
}

export function AdminSecureGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");
  const { data: user, isLoading: userLoading, isError: userError } = useGetMe();

  useEffect(() => {
    if (userLoading) return;

    /* User session invalid → back to login */
    if (userError || !user) {
      setStatus("denied");
      setLocation("/login");
      return;
    }

    /* User must be admin in DB */
    if (!user.isAdmin) {
      setStatus("denied");
      return;
    }

    /* JWT must be present and not expired locally */
    if (!adminToken.isValid()) {
      setStatus("denied");
      adminToken.clear();
      setLocation("/");
      return;
    }

    /* Verify JWT with backend */
    const token = adminToken.get()!;
    verifyJwtSession(token).then((valid) => {
      if (valid) {
        setStatus("ok");
      } else {
        adminToken.clear();
        setStatus("denied");
        setLocation("/");
      }
    });
  }, [userLoading, userError, user, setLocation]);

  if (status === "loading" || (status === "ok" && userLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-violet-600/20 blur-lg animate-pulse" />
            <div className="relative w-14 h-14 rounded-full bg-violet-600/10 border border-violet-500/30 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
            </div>
          </div>
          <p className="text-zinc-500 text-xs tracking-widest uppercase">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (status === "denied" && user && !user.isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#030712] gap-4">
        <Shield className="w-12 h-12 text-red-500" />
        <p className="text-white text-lg font-semibold">Access Denied</p>
        <p className="text-zinc-400 text-sm">Administrator privileges required.</p>
        <button
          onClick={() => setLocation("/dashboard")}
          className="mt-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (status !== "ok") return null;

  return <>{children}</>;
}
