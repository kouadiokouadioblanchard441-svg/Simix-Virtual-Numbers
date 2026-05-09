/**
 * Admin Secure Login — /admin-login
 * Ultra-premium glassmorphism fintech-grade administrator access panel.
 */
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  Shield, Lock, Eye, EyeOff, AlertTriangle,
  CheckCircle2, Activity, Wifi, Globe, Server
} from "lucide-react";
import { adminToken } from "@/lib/admin-token";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getFingerprint(): string {
  const nav = window.navigator;
  const parts = [
    nav.userAgent,
    nav.language,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency ?? 0,
  ];
  return btoa(parts.join("|")).slice(0, 32);
}

export default function SecureLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);
  const [time, setTime] = useState(new Date());
  const emailRef = useRef<HTMLInputElement>(null);

  /* Gate: must have passed token verification */
  useEffect(() => {
    const granted = sessionStorage.getItem("simix_admin_access_granted");
    if (!granted) {
      setLocation("/");
    }
  }, [setLocation]);

  /* If already authenticated, go to admin */
  useEffect(() => {
    if (adminToken.isValid()) {
      setLocation("/admin");
    }
  }, [setLocation]);

  /* Live clock */
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BASE}/api/admin-auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, fingerprint: getFingerprint() }),
      });

      const data = await res.json() as {
        token?: string;
        expiresIn?: number;
        error?: string;
        attemptsRemaining?: number;
      };

      if (!res.ok || !data.token) {
        setError(data.error ?? "Authentication failed");
        if (data.attemptsRemaining !== undefined) {
          setAttemptsLeft(data.attemptsRemaining);
        }
        setLoading(false);
        return;
      }

      const exp = Math.floor(Date.now() / 1000) + (data.expiresIn ?? 28800);
      adminToken.set(data.token, exp);
      setSuccess(true);
      setTimeout(() => setLocation("/admin"), 1000);
    } catch {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  const formattedTime = time.toLocaleTimeString("en-US", { hour12: false });
  const formattedDate = time.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center relative overflow-hidden select-none">

      {/* Animated background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(139,92,246,1) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/6 rounded-full blur-3xl pointer-events-none" />

      {/* Security status bar */}
      <div className="absolute top-0 left-0 right-0 h-10 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-between px-6">
        <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-mono">
          <span className="flex items-center gap-1.5">
            <Wifi className="w-3 h-3 text-emerald-500" />
            TLS 1.3 Encrypted
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-blue-400" />
            Secure Channel
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1.5">
            <Server className="w-3 h-3 text-violet-400" />
            Simix Enterprise
          </span>
        </div>
        <div className="text-[10px] text-zinc-600 font-mono">
          {formattedDate} · {formattedTime}
        </div>
      </div>

      {/* Main card */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Card glow */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-violet-500/20 via-transparent to-transparent pointer-events-none" />

        <div
          className="relative rounded-2xl border border-zinc-800/80 overflow-hidden"
          style={{ background: "rgba(9,9,18,0.95)", backdropFilter: "blur(20px)" }}
        >
          {/* Top accent line */}
          <div className="h-[2px] bg-gradient-to-r from-transparent via-violet-500 to-transparent" />

          <div className="px-8 pt-8 pb-8">
            {/* Icon + Title */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative mb-5">
                <div className="absolute inset-0 rounded-2xl bg-violet-600/20 blur-lg" />
                <div className="relative w-14 h-14 rounded-2xl bg-violet-600/10 border border-violet-500/30 flex items-center justify-center">
                  <Shield className="w-7 h-7 text-violet-400" />
                </div>
              </div>
              <h1 className="text-white text-base font-semibold tracking-wide uppercase">
                Administrator Secure Access
              </h1>
              <p className="text-zinc-500 text-[11px] mt-1 tracking-widest uppercase">
                Simix Enterprise Platform
              </p>

              {/* Security indicators */}
              <div className="flex items-center gap-3 mt-4">
                {[
                  { icon: Lock, label: "Encrypted", color: "text-emerald-400" },
                  { icon: Shield, label: "Protected", color: "text-violet-400" },
                  { icon: Activity, label: "Monitored", color: "text-blue-400" },
                ].map(({ icon: Icon, label, color }) => (
                  <div key={label} className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <Icon className={`w-3 h-3 ${color}`} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Success state */}
            {success ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-emerald-400 text-sm font-medium">Authentication successful</p>
                <p className="text-zinc-500 text-xs">Redirecting to dashboard…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">
                    Administrator Email
                  </label>
                  <div className="relative">
                    <input
                      ref={emailRef}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-zinc-900/80 border border-zinc-700/60 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                      placeholder="admin@simix.africa"
                      autoComplete="username"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">
                    Secure Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-zinc-900/80 border border-zinc-700/60 rounded-lg px-4 py-3 pr-11 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {error && (
                  <div className="flex items-start gap-2 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-400 text-xs">{error}</p>
                      {attemptsLeft !== null && attemptsLeft > 0 && (
                        <p className="text-red-500/70 text-[10px] mt-0.5">
                          {attemptsLeft} attempt{attemptsLeft !== 1 ? "s" : ""} remaining before lockout
                        </p>
                      )}
                      {attemptsLeft === 0 && (
                        <p className="text-red-500/70 text-[10px] mt-0.5">
                          Account locked for 15 minutes
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full relative overflow-hidden rounded-lg py-3 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                  style={{
                    background: loading
                      ? "rgba(109,40,217,0.5)"
                      : "linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)",
                    boxShadow: "0 0 20px rgba(109,40,217,0.3)",
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Authenticating…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Lock className="w-4 h-4" />
                      Authenticate
                    </span>
                  )}
                </button>
              </form>
            )}

            {/* Footer info */}
            <div className="mt-6 pt-5 border-t border-zinc-800/60">
              <div className="flex items-center justify-between text-[10px] text-zinc-600 font-mono">
                <span>All access attempts logged</span>
                <span className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  System online
                </span>
              </div>
              <p className="text-[10px] text-zinc-700 mt-1 text-center">
                Session expires automatically after 8 hours of inactivity
              </p>
            </div>
          </div>
        </div>

        {/* Bottom security badge */}
        <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-zinc-700">
          <Shield className="w-3 h-3" />
          <span>Protected by Simix Advanced Security</span>
          <Shield className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
