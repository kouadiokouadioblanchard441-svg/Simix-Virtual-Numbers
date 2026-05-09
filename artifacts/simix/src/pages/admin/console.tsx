/**
 * Admin Console Entry — /console?t=<ACCESS_TOKEN>
 * Validates the secret URL token with the backend, then redirects
 * to /admin-login. Without a valid token, nothing is revealed.
 */
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Shield, Lock, AlertTriangle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Console() {
  const [, setLocation] = useLocation();
  const search = useSearch().replace(/^\?/, "");
  const params = new URLSearchParams(search);
  const token = params.get("t");

  const [status, setStatus] = useState<"checking" | "denied" | "ok">("checking");

  useEffect(() => {
    if (!token) {
      setStatus("denied");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/admin-auth/verify-token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.ok) {
          setStatus("ok");
          sessionStorage.setItem("simix_admin_access_granted", "1");
          setTimeout(() => setLocation("/admin-login"), 600);
        } else {
          setStatus("denied");
        }
      } catch {
        if (!cancelled) setStatus("denied");
      }
    })();
    return () => { cancelled = true; };
  }, [token, setLocation]);

  if (status === "denied") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-zinc-500 text-sm">Page not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-violet-600/20 blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-full bg-violet-600/10 border border-violet-500/30 flex items-center justify-center">
            {status === "checking" ? (
              <Lock className="w-7 h-7 text-violet-400 animate-pulse" />
            ) : (
              <Shield className="w-7 h-7 text-emerald-400" />
            )}
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-zinc-300 text-sm font-medium tracking-widest uppercase">
            {status === "checking" ? "Verifying Access Token…" : "Access Granted"}
          </p>
          <p className="text-zinc-600 text-xs">Secure connection established</p>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
