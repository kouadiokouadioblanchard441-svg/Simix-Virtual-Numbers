import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Shield, Loader2 } from "lucide-react";
import { adminToken } from "@/lib/admin-token";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AdminSession {
  id: string;
  email: string;
  name: string;
}

async function verifyJwtSession(token: string): Promise<AdminSession | null> {
  try {
    const res = await fetch(`${BASE}/api/admin-auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as { valid?: boolean; admin?: AdminSession };
    return data.valid && data.admin ? data.admin : null;
  } catch {
    return null;
  }
}

export const AdminSessionContext = {
  _admin: null as AdminSession | null,
  get: () => AdminSessionContext._admin,
};

export function AdminSecureGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    if (!adminToken.isValid()) {
      adminToken.clear();
      setStatus("denied");
      setLocation("/admin/secure-login");
      return;
    }

    const token = adminToken.get()!;
    verifyJwtSession(token).then((admin) => {
      if (admin) {
        AdminSessionContext._admin = admin;
        setStatus("ok");
      } else {
        adminToken.clear();
        AdminSessionContext._admin = null;
        setStatus("denied");
        setLocation("/admin/secure-login");
      }
    });
  }, [setLocation]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-violet-600/20 blur-lg animate-pulse" />
            <div className="relative w-14 h-14 rounded-full bg-violet-600/10 border border-violet-500/30 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
            </div>
          </div>
          <p className="text-zinc-500 text-xs tracking-widest uppercase">Vérification de la session…</p>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#030712] gap-4">
        <Shield className="w-12 h-12 text-red-500" />
        <p className="text-white text-lg font-semibold">Accès refusé</p>
        <p className="text-zinc-400 text-sm">Privilèges administrateur requis.</p>
      </div>
    );
  }

  return <>{children}</>;
}
