import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useListPopularServices,
  getListPopularServicesQueryKey,
  useListPopularCountries,
  getListPopularCountriesQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronRight,
  Eye,
  ShoppingBag,
  MessageCircle,
  ArrowRight,
  TrendingUp,
  Star,
  LayoutDashboard,
  Zap,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Link, useLocation } from "wouter";
import { SimixLogo } from "@/components/simix-logo";
import phoneChat3d from "@/assets/simix_phone_chat_3d.png";
import { ServiceIcon } from "@/components/service-icon";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── Banner type ─── */
interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageData: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  bgFrom: string;
  bgTo: string;
  textColor: string;
  isActive: boolean;
  sortOrder: number;
}

/* ─── Fetch banners (public — no auth needed) ─── */
async function fetchBanners(): Promise<Banner[]> {
  const res = await fetch(`${BASE}/api/banners`, { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

/* ─── Default Hero Card — shown when no banners are configured ─── */
function DefaultHeroCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="relative mx-5 bg-gradient-to-br from-violet-600 via-violet-700 to-violet-900 rounded-3xl p-5 mb-5 overflow-hidden shadow-xl shadow-violet-900/30"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_60%)]" />
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-violet-400/20 blur-3xl" />

      <div className="relative z-10 flex items-stretch">
        <div className="flex-1 pr-2">
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-2.5 py-1 rounded-full text-[10px] font-semibold text-white mb-3 border border-white/20">
            <Zap className="w-3 h-3" /> Livraison instantanée
          </div>
          <h2 className="text-[22px] font-extrabold text-white leading-[1.15] mb-2 tracking-tight">
            Votre numéro virtuel<br />en quelques secondes
          </h2>
          <p className="text-[12px] text-violet-100/80 mb-4 leading-relaxed max-w-[200px]">
            Recevez vos SMS de vérification en toute sécurité.
          </p>
          <Link
            href="/services"
            className="inline-flex h-9 items-center justify-center bg-white text-violet-900 px-4 rounded-full text-[13px] font-bold shadow-lg hover:bg-violet-50 transition-colors"
          >
            Acheter un numéro <ArrowRight className="w-4 h-4 ml-1.5" />
          </Link>
        </div>
        <div className="absolute -right-4 -bottom-2 w-36 h-36">
          <img src={phoneChat3d} alt="Phone 3D" className="w-full h-full object-contain drop-shadow-2xl" />
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Banner Slide ─── */
function BannerSlide({ banner }: { banner: Banner }) {
  const img = banner.imageData || banner.imageUrl;
  const [, navigate] = useLocation();

  const content = (
    <div
      className="relative w-full rounded-3xl overflow-hidden shadow-xl"
      style={{ background: `linear-gradient(135deg, ${banner.bgFrom}, ${banner.bgTo})` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_60%)]" />
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20 blur-3xl"
        style={{ background: banner.bgFrom }} />

      <div className="relative z-10 flex items-stretch p-5 min-h-[160px]">
        <div className="flex-1 pr-2 flex flex-col justify-center">
          <h2
            className="text-[22px] font-extrabold leading-[1.15] mb-2 tracking-tight"
            style={{ color: banner.textColor }}
          >
            {banner.title}
          </h2>
          {banner.subtitle && (
            <p
              className="text-[12px] mb-3 leading-relaxed max-w-[200px] opacity-85"
              style={{ color: banner.textColor }}
            >
              {banner.subtitle}
            </p>
          )}
          {banner.linkLabel && (
            <div
              className="inline-flex h-9 items-center justify-center bg-white/20 backdrop-blur-sm border border-white/30 px-4 rounded-full text-[13px] font-bold w-fit"
              style={{ color: banner.textColor }}
            >
              {banner.linkLabel} <ArrowRight className="w-4 h-4 ml-1.5" />
            </div>
          )}
        </div>
        {img && (
          <div className="absolute -right-4 -bottom-0 w-36 h-36 flex-shrink-0">
            <img src={img} alt={banner.title} className="w-full h-full object-contain drop-shadow-2xl" />
          </div>
        )}
      </div>
    </div>
  );

  if (banner.linkUrl) {
    const isExternal = banner.linkUrl.startsWith("http");
    if (isExternal) {
      return (
        <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className="block">
          {content}
        </a>
      );
    }
    return (
      <button className="block w-full text-left" onClick={() => navigate(banner.linkUrl!)}>
        {content}
      </button>
    );
  }

  return content;
}

/* ─── Banner Carousel ─── */
function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = banners.length;

  const goNext = useCallback(() => {
    setCurrent(c => (c + 1) % total);
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrent(c => (c - 1 + total) % total);
  }, [total]);

  /* Auto-advance every 4.5 seconds */
  useEffect(() => {
    if (paused || total <= 1) return;
    intervalRef.current = setInterval(goNext, 4500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [goNext, paused, total]);

  /* Touch swipe support */
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]!.clientX;
    touchStartY.current = e.touches[0]!.clientY;
    setPaused(true);
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0]!.clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0]!.clientY - touchStartY.current);
    if (Math.abs(dx) > 40 && dy < 60) {
      dx < 0 ? goNext() : goPrev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
    setTimeout(() => setPaused(false), 3000);
  }

  if (total === 1) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mx-5 mb-5"
      >
        <BannerSlide banner={banners[0]!} />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="mx-5 mb-5"
    >
      <div
        className="relative overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <BannerSlide banner={banners[current]!} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots indicator */}
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {banners.map((_, i) => (
          <button
            key={i}
            onClick={() => { setCurrent(i); setPaused(true); setTimeout(() => setPaused(false), 4000); }}
            className="transition-all"
            style={{
              width: i === current ? 20 : 6,
              height: 6,
              borderRadius: 999,
              background: i === current
                ? banners[current]!.bgFrom
                : "rgba(255,255,255,0.2)",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  return (
    <AuthGuard>
      <AppLayout>
        <DashboardContent />
      </AppLayout>
    </AuthGuard>
  );
}

function DashboardContent() {
  const { data: me } = useGetMe();
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: popularServices, isLoading: loadingServices } = useListPopularServices({
    query: { queryKey: getListPopularServicesQueryKey() },
  });
  const { data: popularCountries, isLoading: loadingCountries } = useListPopularCountries({
    query: { queryKey: getListPopularCountriesQueryKey() },
  });
  const { data: banners = [] } = useQuery({
    queryKey: ["banners"],
    queryFn: fetchBanners,
    staleTime: 60_000,
  });

  const firstName = (me?.fullName || me?.username || me?.phone || "").split(" ")[0] || "Bienvenue";
  const initials = firstName.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "S";

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pt-5 pb-28">
      <div className="absolute top-0 left-0 right-0 h-72 bg-gradient-to-b from-violet-600/15 via-violet-900/5 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex justify-between items-center mb-5 px-5">
        <div className="flex items-center gap-3">
          {me?.avatar ? (
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-violet-500/40 shadow-md">
              <img src={me.avatar} alt="avatar" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-violet-500/30">
              {initials}
            </div>
          )}
          <div>
            <p className="text-[11px] text-muted-foreground leading-tight">Bonjour 👋</p>
            <p className="text-sm font-bold text-foreground leading-tight">{firstName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {me?.isAdmin && (
            <Link href="/admin">
              <button className="w-10 h-10 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 hover:bg-violet-600/30 transition-colors" title="Admin">
                <LayoutDashboard className="w-[18px] h-[18px]" />
              </button>
            </Link>
          )}
          <NotificationBell isAuthenticated={!!me} />
        </div>
      </div>

      {/* ── Hero Banner (carousel or default) ── */}
      <div className="relative z-10">
        {banners.length > 0 ? (
          <BannerCarousel banners={banners} />
        ) : (
          <DefaultHeroCard />
        )}
      </div>

      {/* Balance + Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative z-10 mx-5 bg-card border border-card-border rounded-2xl p-4 mb-5 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Solde Simix</p>
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-extrabold text-foreground tracking-tight">
                {loadingSummary ? "···" : formatFCFA(summary?.balance || 0)}
              </h3>
              <Eye className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
          <Link
            href="/wallet"
            className="h-10 bg-violet-500 hover:bg-violet-600 text-white px-4 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-violet-500/30"
          >
            <Plus className="w-4 h-4" /> Recharger
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-1 pt-3 border-t border-card-border">
          {[
            { href: "/services", icon: ShoppingBag, label: "Acheter", bg: "bg-violet-500/10", fg: "text-violet-500" },
            { href: "/history", icon: MessageCircle, label: "Mes SMS", bg: "bg-blue-500/10", fg: "text-blue-500" },
            { href: "/wallet", icon: TrendingUp, label: "Historique", bg: "bg-emerald-500/10", fg: "text-emerald-500" },
          ].map(({ href, icon: Icon, label, bg, fg }) => (
            <Link key={href} href={href}>
              <div className="flex flex-col items-center gap-1.5 py-2 px-1 rounded-xl hover:bg-secondary/60 active:scale-95 transition-all cursor-pointer">
                <div className={`w-11 h-11 rounded-2xl ${bg} flex items-center justify-center shadow-sm`}>
                  <Icon className={`w-5 h-5 ${fg} stroke-[2]`} />
                </div>
                <span className="text-[11px] font-semibold text-foreground/80 leading-none">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Trust Stats */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="relative z-10 mx-5 grid grid-cols-3 gap-3 mb-6"
      >
        {[
          { icon: "/3d/icon-shield.png", value: "98%", label: "Réussite SMS", bg: "from-emerald-500/15 to-emerald-900/5" },
          { icon: "/3d/icon-lightning.png", value: "< 30s", label: "Délai moyen", bg: "from-emerald-500/15 to-emerald-900/5" },
          { icon: "/3d/step-globe.png", value: "20+", label: "Pays", bg: "from-violet-500/15 to-violet-900/5" },
        ].map(({ icon, value, label, bg }) => (
          <div key={label} className={`bg-gradient-to-br ${bg} border border-card-border rounded-2xl p-3 flex flex-col items-center text-center gap-1.5`}>
            <img src={icon} alt={label} className="w-8 h-8 object-contain drop-shadow-md" />
            <span className="text-base font-black text-foreground leading-none">{value}</span>
            <span className="text-[10px] text-muted-foreground leading-tight font-medium">{label}</span>
          </div>
        ))}
      </motion.div>

      {/* Popular Services */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="relative z-10 mb-7"
      >
        <div className="flex justify-between items-end mb-3 px-5">
          <div>
            <h2 className="text-[17px] font-extrabold text-foreground leading-tight">Services populaires</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Logos officiels, prix garantis</p>
          </div>
          <Link href="/services" className="text-[12px] font-semibold text-violet-400 hover:underline flex items-center gap-0.5">
            Voir tout <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2.5 px-5">
          {loadingServices ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[1/1.15] bg-card border border-card-border rounded-2xl animate-pulse" />
            ))
          ) : (
            popularServices?.slice(0, 6).map((service: any) => (
              <Link
                key={service.id}
                href={`/countries?serviceId=${service.id}`}
                className="group relative bg-card border border-card-border rounded-2xl p-2.5 flex flex-col items-center text-center hover:border-violet-500/40 hover:bg-secondary/40 transition-all hover:-translate-y-0.5"
              >
                <ServiceIcon name={service.name} slug={service.slug} size={44} rounded="xl" />
                <p className="text-[12px] font-bold text-foreground leading-tight mt-2 w-full truncate">
                  {service.name}
                </p>
                <p className="text-[10px] font-semibold text-violet-400 leading-tight mt-0.5">
                  {formatFCFA(service.price)}
                </p>
              </Link>
            ))
          )}
        </div>
      </motion.div>

      {/* Popular Countries */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
        className="relative z-10 mb-7"
      >
        <div className="flex justify-between items-end mb-3 px-5">
          <div>
            <h2 className="text-[17px] font-extrabold text-foreground leading-tight">Pays disponibles</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Numéros locaux & internationaux</p>
          </div>
          <Link href="/countries" className="text-[12px] font-semibold text-violet-400 hover:underline flex items-center gap-0.5">
            Voir tout <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-2 snap-x hide-scrollbar px-5">
          {loadingCountries
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="min-w-[92px] h-28 bg-card border border-card-border rounded-2xl animate-pulse snap-start" />
              ))
            : popularCountries?.slice(0, 8).map((country: any) => (
                <Link
                  key={country.id}
                  href={`/services?countryId=${country.id}`}
                  className="min-w-[92px] bg-card border border-card-border rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 snap-start hover:border-violet-500/40 hover:bg-secondary/40 transition-all hover:-translate-y-0.5 flex-shrink-0"
                >
                  <span className="text-[28px] leading-none">{country.flag}</span>
                  <span className="text-[12px] font-bold text-foreground truncate w-full text-center leading-tight">
                    {country.name}
                  </span>
                  <span className="text-[10px] font-semibold text-violet-400 leading-tight">{country.dialCode}</span>
                </Link>
              ))}
        </div>
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="relative z-10 mx-5 mb-7"
      >
        <h2 className="text-[17px] font-extrabold text-foreground mb-3 leading-tight">Comment ça marche ?</h2>
        <div className="bg-card border border-card-border rounded-2xl p-4 space-y-0 divide-y divide-card-border/50">
          {[
            { n: "01", icon: "/3d/step-globe.png", title: "Choisissez un service", desc: "WhatsApp, Telegram, Google, TikTok…" },
            { n: "02", icon: "/3d/step-phone.png", title: "Sélectionnez un pays", desc: "20+ pays disponibles" },
            { n: "03", icon: "/3d/step-payment.png", title: "Recevez votre SMS", desc: "En moins de 30 secondes" },
          ].map((step) => (
            <div key={step.n} className="flex items-center gap-3 py-3">
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                <img src={step.icon} alt={step.title} className="w-9 h-9 object-contain drop-shadow-lg" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-foreground leading-tight">
                  <span className="text-muted-foreground font-semibold mr-1.5">{step.n}.</span>
                  {step.title}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Trust Footer */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36 }}
        className="relative z-10 mx-5 bg-gradient-to-br from-card to-secondary/50 border border-card-border rounded-2xl p-4 flex items-center gap-3"
      >
        <img src="/3d/icon-check.png" alt="Trust" className="w-10 h-10 object-contain drop-shadow-md flex-shrink-0" />
        <div className="flex-1">
          <p className="text-[13px] font-bold text-foreground leading-tight">+12 000 utilisateurs satisfaits</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            Note 4.8/5 — Paiement Orange Money & MTN
          </p>
        </div>
        <SimixLogo size={18} />
      </motion.div>
    </div>
  );
}
