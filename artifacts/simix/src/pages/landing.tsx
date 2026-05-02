import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useGetMe } from "@workspace/api-client-react";
import { SimixLogo } from "@/components/simix-logo";
import phone3d from "@/assets/simix_phone_3d.png";
import phonechat3d from "@/assets/simix_phone_chat_3d.png";
import wallet3d from "@/assets/simix_wallet_3d.png";
import screenDash from "@/assets/screen-dashboard.png";
import screenWallet from "@/assets/screen-wallet.png";
import screenCountries from "@/assets/screen-countries.png";
import screenAuth from "@/assets/screen-auth.png";
import {
  Shield, Zap, Globe, Smartphone, Lock, CheckCircle,
  ArrowRight, Star, ChevronRight, MessageSquare, Users,
  TrendingUp, Wifi, CreditCard, RefreshCw, Eye, Clock,
} from "lucide-react";

/* ─── Data ─── */
const AFRICA_COUNTRIES = [
  { flag: "🇩🇿", name: "Algérie" },
  { flag: "🇦🇴", name: "Angola" },
  { flag: "🇧🇯", name: "Bénin" },
  { flag: "🇧🇼", name: "Botswana" },
  { flag: "🇧🇫", name: "Burkina Faso" },
  { flag: "🇧🇮", name: "Burundi" },
  { flag: "🇨🇲", name: "Cameroun" },
  { flag: "🇨🇻", name: "Cap-Vert" },
  { flag: "🇨🇫", name: "Centrafrique" },
  { flag: "🇰🇲", name: "Comores" },
  { flag: "🇨🇬", name: "Congo" },
  { flag: "🇨🇩", name: "Congo RDC" },
  { flag: "🇨🇮", name: "Côte d'Ivoire" },
  { flag: "🇩🇯", name: "Djibouti" },
  { flag: "🇪🇬", name: "Égypte" },
  { flag: "🇪🇷", name: "Érythrée" },
  { flag: "🇸🇿", name: "Eswatini" },
  { flag: "🇪🇹", name: "Éthiopie" },
  { flag: "🇬🇦", name: "Gabon" },
  { flag: "🇬🇲", name: "Gambie" },
  { flag: "🇬🇭", name: "Ghana" },
  { flag: "🇬🇳", name: "Guinée" },
  { flag: "🇬🇶", name: "Guinée Éq." },
  { flag: "🇬🇼", name: "Guinée-Bissau" },
  { flag: "🇰🇪", name: "Kenya" },
  { flag: "🇱🇸", name: "Lesotho" },
  { flag: "🇱🇷", name: "Liberia" },
  { flag: "🇱🇾", name: "Libye" },
  { flag: "🇲🇬", name: "Madagascar" },
  { flag: "🇲🇼", name: "Malawi" },
  { flag: "🇲🇱", name: "Mali" },
  { flag: "🇲🇦", name: "Maroc" },
  { flag: "🇲🇷", name: "Mauritanie" },
  { flag: "🇲🇺", name: "Maurice" },
  { flag: "🇲🇿", name: "Mozambique" },
  { flag: "🇳🇦", name: "Namibie" },
  { flag: "🇳🇪", name: "Niger" },
  { flag: "🇳🇬", name: "Nigéria" },
  { flag: "🇺🇬", name: "Ouganda" },
  { flag: "🇷🇼", name: "Rwanda" },
  { flag: "🇸🇹", name: "São Tomé" },
  { flag: "🇸🇳", name: "Sénégal" },
  { flag: "🇸🇨", name: "Seychelles" },
  { flag: "🇸🇱", name: "Sierra Leone" },
  { flag: "🇸🇴", name: "Somalie" },
  { flag: "🇿🇦", name: "Afrique du Sud" },
  { flag: "🇸🇩", name: "Soudan" },
  { flag: "🇸🇸", name: "Soudan du Sud" },
  { flag: "🇹🇿", name: "Tanzanie" },
  { flag: "🇹🇩", name: "Tchad" },
  { flag: "🇹🇬", name: "Togo" },
  { flag: "🇹🇳", name: "Tunisie" },
  { flag: "🇿🇲", name: "Zambie" },
  { flag: "🇿🇼", name: "Zimbabwe" },
];

const OPERATORS = [
  { name: "Orange Money", abbr: "OM", color: "#FF7A00", countries: "CI · SN · ML · BF · CM · GN", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Orange_logo.svg/200px-Orange_logo.svg.png" },
  { name: "MTN Mobile Money", abbr: "MTN", color: "#FFCC00", countries: "GH · NG · CI · CM · UG · RW", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/MTN_Logo.svg/200px-MTN_Logo.svg.png" },
  { name: "Wave", abbr: "W", color: "#1BC5F4", countries: "SN · CI · BF · ML · GN", logoUrl: null },
  { name: "Moov Money", abbr: "MV", color: "#E2001A", countries: "CI · BF · TG · BJ · NE", logoUrl: null },
  { name: "M-Pesa", abbr: "MP", color: "#4CAF50", countries: "KE · TZ · MZ · UG · RW", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/M-pesa_logo.svg/200px-M-pesa_logo.svg.png" },
  { name: "Airtel Money", abbr: "AM", color: "#FF0000", countries: "KE · NG · UG · TZ · ZM", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Airtel_logo.svg/200px-Airtel_logo.svg.png" },
  { name: "Free Money", abbr: "FM", color: "#E30613", countries: "Sénégal", logoUrl: null },
  { name: "Zamtel Kwacha", abbr: "ZK", color: "#007EC4", countries: "Zambie", logoUrl: null },
];

const SERVICES = [
  { name: "WhatsApp", color: "#25D366", icon: "💬" },
  { name: "Telegram", color: "#2AABEE", icon: "✈️" },
  { name: "Google", color: "#4285F4", icon: "🔍" },
  { name: "Facebook", color: "#1877F2", icon: "📘" },
  { name: "Instagram", color: "#E1306C", icon: "📸" },
  { name: "TikTok", color: "#FF0050", icon: "🎵" },
  { name: "X / Twitter", color: "#1a1a1a", icon: "🐦" },
  { name: "Netflix", color: "#E50914", icon: "🎬" },
  { name: "Amazon", color: "#FF9900", icon: "📦" },
  { name: "PayPal", color: "#003087", icon: "💳" },
  { name: "Binance", color: "#F3BA2F", icon: "₿" },
  { name: "Discord", color: "#5865F2", icon: "🎮" },
  { name: "Snapchat", color: "#FFFC00", textDark: true, icon: "👻" },
  { name: "Spotify", color: "#1DB954", icon: "🎵" },
  { name: "Uber", color: "#000000", icon: "🚗" },
  { name: "LinkedIn", color: "#0077B5", icon: "💼" },
  { name: "Microsoft", color: "#0078D4", icon: "🪟" },
  { name: "Steam", color: "#1b2838", icon: "🎮" },
  { name: "Coinbase", color: "#0052FF", icon: "🪙" },
  { name: "Airbnb", color: "#FF5A5F", icon: "🏠" },
  { name: "Booking", color: "#003580", icon: "🛏️" },
  { name: "Shein", color: "#000000", icon: "👗" },
  { name: "OLX", color: "#3F2A8F", icon: "🛒" },
  { name: "+500 autres", color: "#7C3AED", icon: "✨" },
];

const STEPS = [
  {
    number: "01",
    icon: <Globe className="w-6 h-6" />,
    title: "Choisissez un pays et un service",
    desc: "Sélectionnez le pays du numéro désiré parmi 54 nations africaines et au-delà, puis choisissez le service (WhatsApp, Google, Telegram…).",
    color: "#7C3AED",
  },
  {
    number: "02",
    icon: <Smartphone className="w-6 h-6" />,
    title: "Obtenez votre numéro virtuel",
    desc: "Un numéro temporaire vous est attribué instantanément. Utilisez-le pour recevoir votre code de vérification SMS.",
    color: "#EC4899",
  },
  {
    number: "03",
    icon: <CreditCard className="w-6 h-6" />,
    title: "Payez via Mobile Money en FCFA",
    desc: "Rechargez votre solde avec Orange Money, MTN, Wave ou tout autre opérateur local. Pas de carte bancaire requise.",
    color: "#F59E0B",
  },
];

const SECURITY_FEATURES = [
  { icon: <Lock className="w-5 h-5" />, title: "Chiffrement bout en bout", desc: "Vos données et transactions sont chiffrées avec les standards les plus élevés." },
  { icon: <Eye className="w-5 h-5" />, title: "Numéros éphémères", desc: "Chaque numéro est temporaire et détruit après usage. Aucun historique conservé." },
  { icon: <Shield className="w-5 h-5" />, title: "Aucune carte bancaire", desc: "Uniquement du Mobile Money local. Vos coordonnées bancaires ne sont jamais sollicitées." },
  { icon: <RefreshCw className="w-5 h-5" />, title: "Remboursement garanti", desc: "Si aucun SMS n'est reçu dans les délais, votre solde est remboursé automatiquement." },
  { icon: <Clock className="w-5 h-5" />, title: "Disponible 24h/24", desc: "Plateforme opérationnelle à toute heure, tous les jours de l'année, sans interruption." },
  { icon: <CheckCircle className="w-5 h-5" />, title: "Numéros vérifiés actifs", desc: "Chaque numéro est testé et vérifié avant d'être proposé à la vente." },
];

/* ─── Small logo component ─── */
function OperatorLogoImg({ op }: { op: typeof OPERATORS[0] }) {
  const [err, setErr] = useState(false);
  if (op.logoUrl && !err) {
    return <img src={op.logoUrl} alt={op.name} onError={() => setErr(true)} className="w-9 h-9 object-contain" />;
  }
  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: op.color }}>
      {op.abbr}
    </div>
  );
}

/* ─── Section wrapper ─── */
function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`px-4 sm:px-8 lg:px-16 xl:px-24 ${className}`}>{children}</section>;
}

/* ─── Marquee ticker ─── */
function CountriesTicker() {
  const doubled = [...AFRICA_COUNTRIES, ...AFRICA_COUNTRIES];
  const doubled2 = [...AFRICA_COUNTRIES, ...AFRICA_COUNTRIES];
  return (
    <div className="py-10 overflow-hidden border-y border-zinc-800/60 bg-zinc-950/50">
      <div className="flex items-center gap-6 mb-4 px-4 sm:px-8 lg:px-16 xl:px-24">
        <span className="text-zinc-400 text-sm font-semibold uppercase tracking-widest whitespace-nowrap">54 pays africains</span>
        <div className="h-px flex-1 bg-gradient-to-r from-violet-600/40 to-transparent" />
      </div>
      {/* Row 1 — left */}
      <div className="overflow-hidden mb-3">
        <div className="marquee-track">
          {doubled.map((c, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-2 mx-1.5 bg-zinc-900/80 border border-zinc-800/60 rounded-full whitespace-nowrap flex-shrink-0">
              <span className="text-lg">{c.flag}</span>
              <span className="text-sm text-zinc-300 font-medium">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Row 2 — right (reverse) */}
      <div className="overflow-hidden">
        <div className="marquee-track-reverse">
          {doubled2.map((c, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-2 mx-1.5 bg-zinc-900/60 border border-violet-900/30 rounded-full whitespace-nowrap flex-shrink-0">
              <span className="text-lg">{c.flag}</span>
              <span className="text-sm text-zinc-400 font-medium">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Navbar ─── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "py-3 bg-black/80 backdrop-blur-xl border-b border-zinc-800/60 shadow-lg shadow-black/20" : "py-5 bg-transparent"}`}>
      <div className="px-4 sm:px-8 lg:px-16 xl:px-24 flex items-center justify-between gap-4">
        <SimixLogo size={28} />
        <div className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
          <a href="#comment" className="hover:text-white transition-colors">Comment ça marche</a>
          <a href="#operateurs" className="hover:text-white transition-colors">Opérateurs</a>
          <a href="#services" className="hover:text-white transition-colors">Services</a>
          <a href="#securite" className="hover:text-white transition-colors">Sécurité</a>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setLocation("/login")} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
            Se connecter
          </button>
          <button onClick={() => setLocation("/register")} className="px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors shadow-lg shadow-violet-600/20">
            S'inscrire
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ─── Hero ─── */
function Hero() {
  const [, setLocation] = useLocation();
  return (
    <div className="relative min-h-[100dvh] flex flex-col justify-center landing-grid overflow-hidden pt-24 pb-16">
      {/* Glow orbs */}
      <div className="glow-orb absolute -top-20 -left-20 w-[600px] h-[600px] bg-violet-600/15" />
      <div className="glow-orb absolute top-1/2 -right-40 w-[500px] h-[400px] bg-purple-800/20" />
      <div className="glow-orb absolute bottom-0 left-1/3 w-[400px] h-[300px] bg-pink-900/15" />

      <Section className="relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — text */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600/15 border border-violet-600/30 rounded-full text-violet-300 text-sm font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Fintech 100% Africaine — Paiements Mobile Money
            </div>

            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold leading-[1.1] text-white mb-6">
              Recevez vos{" "}
              <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                codes SMS
              </span>{" "}
              depuis n'importe quel service,{" "}
              <span className="text-violet-400">partout en Afrique.</span>
            </h1>

            <p className="text-lg text-zinc-400 leading-relaxed mb-8 max-w-xl">
              Des numéros virtuels temporaires pour vérifier vos comptes WhatsApp, Telegram, Google et bien plus —
              payés en <strong className="text-white">FCFA via Orange Money, MTN, Wave</strong> et tous les opérateurs Mobile Money du continent.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 mb-10">
              <button
                onClick={() => setLocation("/register")}
                className="flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all shadow-xl shadow-violet-600/30 text-base"
              >
                Créer un compte gratuitement <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLocation("/login")}
                className="flex items-center gap-2 px-7 py-3.5 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-white font-semibold rounded-xl transition-all text-base"
              >
                Se connecter <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Trust stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: "54", label: "Pays africains", icon: "🌍" },
                { value: "11+", label: "Opérateurs Mobile Money", icon: "💳" },
                { value: "500+", label: "Services supportés", icon: "✅" },
              ].map((s, i) => (
                <div key={i} className="text-center p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                  <div className="text-xl mb-0.5">{s.icon}</div>
                  <div className="text-xl font-bold text-white">{s.value}</div>
                  <div className="text-xs text-zinc-500 leading-tight">{s.label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — phone mockups */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="hidden lg:flex items-center justify-center relative"
          >
            <div className="relative w-full max-w-[440px] h-[520px]">
              {/* Main phone */}
              <div className="absolute left-1/2 -translate-x-1/2 top-0 z-10 float-slow">
                <img src={phone3d} alt="Simix App" className="w-[240px] drop-shadow-2xl" />
              </div>
              {/* Dashboard screen card */}
              <div className="absolute right-0 top-24 z-20 float-fast">
                <div className="glass rounded-2xl overflow-hidden shadow-2xl shadow-violet-900/30 w-[130px]">
                  <img src={screenDash} alt="Dashboard" className="w-full" />
                </div>
              </div>
              {/* Wallet screen card */}
              <div className="absolute left-0 bottom-8 z-20 float-slow" style={{ animationDelay: "1s" }}>
                <div className="glass rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/30 w-[120px]">
                  <img src={screenWallet} alt="Wallet" className="w-full" />
                </div>
              </div>
              {/* Notification bubble */}
              <div className="absolute right-4 bottom-28 z-30">
                <div className="glass px-4 py-2.5 rounded-2xl shadow-lg border border-emerald-500/20 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div>
                    <div className="text-xs font-semibold text-white">SMS reçu !</div>
                    <div className="text-[10px] text-zinc-400">Code : <span className="text-emerald-400 font-mono font-bold">847291</span></div>
                  </div>
                </div>
              </div>
              {/* Currency bubble */}
              <div className="absolute left-4 top-20 z-30">
                <div className="glass px-3 py-2 rounded-xl shadow-lg border border-amber-500/20 flex items-center gap-1.5">
                  <span className="text-base">💰</span>
                  <div>
                    <div className="text-xs text-zinc-400">Solde</div>
                    <div className="text-sm font-bold text-white">5 000 <span className="text-[10px] text-zinc-500">FCFA</span></div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-zinc-600">
        <div className="w-5 h-9 border-2 border-zinc-700 rounded-full flex justify-center pt-1.5">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-1 h-1.5 bg-zinc-500 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/* ─── Stats bar ─── */
function StatsBar() {
  const stats = [
    { icon: <Globe className="w-5 h-5 text-violet-400" />, value: "54", label: "Pays africains couverts" },
    { icon: <Smartphone className="w-5 h-5 text-pink-400" />, value: "11+", label: "Opérateurs Mobile Money" },
    { icon: <MessageSquare className="w-5 h-5 text-emerald-400" />, value: "500+", label: "Services vérifiables" },
    { icon: <Zap className="w-5 h-5 text-amber-400" />, value: "< 30s", label: "Réception du SMS" },
    { icon: <TrendingUp className="w-5 h-5 text-sky-400" />, value: "100%", label: "Paiement Mobile Money" },
    { icon: <Shield className="w-5 h-5 text-rose-400" />, value: "SSL", label: "Connexion sécurisée" },
  ];
  return (
    <div className="border-y border-zinc-800/60 bg-zinc-950/80">
      <Section>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-zinc-800/40">
          {stats.map((s, i) => (
            <div key={i} className="flex flex-col items-center py-6 gap-2 text-center px-3">
              {s.icon}
              <div className="text-2xl font-extrabold text-white">{s.value}</div>
              <div className="text-xs text-zinc-500 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ─── How it works ─── */
function HowItWorks() {
  return (
    <Section className="py-24" id="comment">
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-600/10 border border-violet-600/20 rounded-full text-violet-400 text-xs font-semibold uppercase tracking-widest mb-4">
          Simple & rapide
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Comment ça marche ?</h2>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          En 3 étapes simples, obtenez votre numéro et recevez votre code SMS depuis n'importe quel service.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 relative">
        {/* connector line */}
        <div className="hidden md:block absolute top-16 left-[22%] right-[22%] h-px bg-gradient-to-r from-violet-600/40 via-pink-600/40 to-amber-500/40" />

        {STEPS.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl p-7 hover:border-zinc-700 transition-colors"
          >
            {/* Step number badge */}
            <div className="absolute -top-3 left-6">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full text-white" style={{ backgroundColor: step.color }}>
                {step.number}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 mt-2" style={{ backgroundColor: `${step.color}20`, color: step.color }}>
              {step.icon}
            </div>
            <h3 className="text-lg font-bold text-white mb-3">{step.title}</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ─── Payment Operators ─── */
function PaymentOperators() {
  return (
    <Section className="py-24 bg-gradient-to-b from-transparent via-zinc-950/50 to-transparent" id="operateurs">
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-xs font-semibold uppercase tracking-widest mb-4">
          Mobile Money
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Payez avec votre opérateur local</h2>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          Tous les grands opérateurs Mobile Money d'Afrique acceptés. Pas de carte bancaire, pas de devises étrangères.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {OPERATORS.map((op, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.07 }}
            className="service-card bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors cursor-default"
          >
            <div className="flex items-center gap-3 mb-3">
              <OperatorLogoImg op={op} />
              <div className="min-w-0">
                <div className="font-bold text-white text-sm truncate">{op.name}</div>
              </div>
            </div>
            <div className="text-xs text-zinc-500 leading-relaxed">{op.countries}</div>
            <div className="mt-3 h-1 rounded-full" style={{ background: `linear-gradient(to right, ${op.color}40, ${op.color}15)` }}>
              <div className="h-full rounded-full w-3/4" style={{ backgroundColor: op.color }} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <p className="text-zinc-500 text-sm">
          🌍 Disponible dans <strong className="text-white">54 pays africains</strong> — Paiements en{" "}
          <strong className="text-violet-400">FCFA, KES, GHS, NGN</strong> et toutes monnaies locales
        </p>
      </div>
    </Section>
  );
}

/* ─── App screenshots showcase ─── */
function AppShowcase() {
  return (
    <div className="py-24 overflow-hidden bg-gradient-to-b from-violet-950/10 via-purple-950/5 to-transparent">
      <Section>
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-pink-600/10 border border-pink-600/20 rounded-full text-pink-400 text-xs font-semibold uppercase tracking-widest mb-4">
              Interface intuitive
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-5">
              Une app pensée pour <span className="text-violet-400">l'Afrique</span>
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed mb-8">
              Interface claire, légère et optimisée pour les connexions mobiles africaines. Fonctionne même avec une connexion 3G.
            </p>
            <ul className="space-y-4">
              {[
                { icon: <Smartphone className="w-4 h-4" />, text: "Interface mobile-first, compatible tous smartphones" },
                { icon: <Wifi className="w-4 h-4" />, text: "Optimisé pour les réseaux 3G/4G africains" },
                { icon: <Globe className="w-4 h-4" />, text: "Disponible en français, anglais, et bientôt en langue locales" },
                { icon: <Users className="w-4 h-4" />, text: "Adapté aux usages quotidiens des Africains connectés" },
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-violet-600/20 flex items-center justify-center text-violet-400 flex-shrink-0 mt-0.5">
                    {item.icon}
                  </div>
                  <span className="text-zinc-300 text-sm">{item.text}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Screenshots */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex justify-center gap-4 items-end"
          >
            <div className="float-slow">
              <div className="rounded-2xl overflow-hidden border border-zinc-700/40 shadow-2xl shadow-violet-900/20 w-[130px] sm:w-[150px]">
                <img src={screenDash} alt="Dashboard Simix" className="w-full" />
              </div>
            </div>
            <div className="float-fast" style={{ animationDelay: "0.5s" }}>
              <div className="rounded-2xl overflow-hidden border border-zinc-700/40 shadow-2xl shadow-purple-900/20 w-[130px] sm:w-[150px] mb-8">
                <img src={screenWallet} alt="Wallet Simix" className="w-full" />
              </div>
            </div>
            <div className="float-slow" style={{ animationDelay: "1s" }}>
              <div className="rounded-2xl overflow-hidden border border-zinc-700/40 shadow-2xl shadow-pink-900/20 w-[130px] sm:w-[150px]">
                <img src={screenCountries} alt="Pays Simix" className="w-full" />
              </div>
            </div>
          </motion.div>
        </div>
      </Section>
    </div>
  );
}

/* ─── Africa Vision ─── */
function AfricaVision() {
  return (
    <Section className="py-24">
      <div className="relative rounded-3xl overflow-hidden border border-zinc-800/60">
        {/* Background photo */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?w=1400&q=80&auto=format&fit=crop)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/85 to-black/60" />
        <div className="relative z-10 p-8 sm:p-12 lg:p-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-full text-amber-400 text-xs font-semibold uppercase tracking-widest mb-6">
              🌍 Notre vision pour l'Afrique
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-6 leading-tight">
              L'inclusion numérique,{" "}
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                accessible à tous les Africains
              </span>
            </h2>
            <p className="text-zinc-300 text-base leading-relaxed mb-6">
              Plus de <strong className="text-white">800 millions d'Africains</strong> utilisent le Mobile Money comme principal outil financier.
              Pourtant, des centaines de services numériques essentiels exigent une vérification SMS que beaucoup ne peuvent pas accomplir.
            </p>
            <p className="text-zinc-400 text-sm leading-relaxed mb-8">
              Simix brise cette barrière. Nous croyons que chaque Africain mérite un accès égal à l'économie numérique mondiale —
              sans carte bancaire, sans devises étrangères, sans complications.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: "800M+", label: "Utilisateurs Mobile Money en Afrique", color: "text-amber-400" },
                { value: "54", label: "Nations africaines, une seule plateforme", color: "text-violet-400" },
                { value: "0 XAF", label: "Frais de création de compte", color: "text-emerald-400" },
                { value: "30s", label: "Temps moyen de livraison SMS", color: "text-pink-400" },
              ].map((s, i) => (
                <div key={i} className="glass p-4 rounded-xl">
                  <div className={`text-2xl font-extrabold mb-1 ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-zinc-400 leading-tight">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right side: floating wallet */}
          <div className="hidden lg:flex justify-center items-center">
            <div className="relative">
              <div className="float-slow">
                <img src={wallet3d} alt="Simix Wallet" className="w-64 drop-shadow-2xl" />
              </div>
              <div className="absolute -bottom-4 -left-8">
                <div className="glass px-4 py-3 rounded-2xl border border-emerald-500/20">
                  <div className="text-xs text-zinc-400 mb-0.5">Transaction réussie</div>
                  <div className="text-sm font-bold text-emerald-400">+2 000 FCFA rechargés</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ─── Services grid ─── */
function ServicesGrid() {
  return (
    <Section className="py-24" id="services">
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-600/10 border border-emerald-600/20 rounded-full text-emerald-400 text-xs font-semibold uppercase tracking-widest mb-4">
          500+ plateformes
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Vérifiez n'importe quel service</h2>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          WhatsApp, Telegram, Google, TikTok et des centaines d'autres plateformes disponibles dans notre catalogue.
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {SERVICES.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.03 }}
            className="service-card group relative flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 cursor-default overflow-hidden"
            style={{ borderTopColor: `${s.color}30` }}
          >
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity"
              style={{ background: `radial-gradient(circle at center, ${s.color}, transparent)` }}
            />
            <span className="text-2xl relative z-10">{s.icon}</span>
            <span className={`text-xs font-semibold text-center leading-tight relative z-10 ${s.textDark ? "text-zinc-800" : "text-zinc-300"}`}>{s.name}</span>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-60" style={{ backgroundColor: s.color }} />
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ─── Security ─── */
function Security() {
  return (
    <Section className="py-24" id="securite">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-sky-600/10 border border-sky-600/20 rounded-full text-sky-400 text-xs font-semibold uppercase tracking-widest mb-4">
            Confiance & Sécurité
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-5">
            Votre sécurité,{" "}
            <span className="text-sky-400">notre priorité absolue</span>
          </h2>
          <p className="text-zinc-400 text-lg leading-relaxed mb-8">
            Chaque transaction, chaque numéro, chaque SMS est protégé par des protocoles de sécurité de niveau bancaire.
          </p>
          <div className="flex flex-wrap gap-3">
            {["Chiffrement SSL/TLS", "Numéros éphémères", "RGPD Compliant", "2FA disponible"].map(tag => (
              <span key={tag} className="px-3 py-1.5 text-xs font-semibold bg-sky-600/10 border border-sky-600/20 text-sky-400 rounded-full">{tag}</span>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SECURITY_FEATURES.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="flex gap-3.5 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-sky-600/15 flex items-center justify-center text-sky-400 flex-shrink-0">
                {f.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-white mb-0.5">{f.title}</div>
                <div className="text-xs text-zinc-500 leading-relaxed">{f.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ─── Final CTA ─── */
function FinalCTA() {
  const [, setLocation] = useLocation();
  return (
    <Section className="py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative rounded-3xl overflow-hidden border border-violet-800/30 p-8 sm:p-14 text-center"
        style={{ background: "linear-gradient(135deg, #1e0a3c, #0a0a12, #0d0520)" }}
      >
        <div className="glow-orb absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-violet-600/20" />
        <div className="relative z-10">
          <div className="text-5xl mb-4">🚀</div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-5 leading-tight">
            Rejoignez la révolution<br />
            <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
              Fintech africaine
            </span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
            Créez votre compte en 30 secondes. Aucune carte bancaire requise.
            Commencez avec votre Mobile Money local.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => setLocation("/register")}
              className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all shadow-2xl shadow-violet-600/30 text-base"
            >
              Créer mon compte gratuit <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLocation("/login")}
              className="flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold rounded-xl transition-all text-base"
            >
              J'ai déjà un compte
            </button>
          </div>
          <p className="text-zinc-600 text-xs mt-6 flex items-center justify-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            Inscription gratuite · Aucune carte requise · Paiement Mobile Money
          </p>
        </div>
      </motion.div>
    </Section>
  );
}

/* ─── Footer ─── */
function Footer() {
  const [, setLocation] = useLocation();
  return (
    <footer className="border-t border-zinc-800/60 bg-zinc-950/80">
      <Section className="py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <SimixLogo size={24} />
            <p className="text-zinc-500 text-sm mt-3 leading-relaxed max-w-xs">
              La plateforme de numéros virtuels SMS pensée pour les Africains. Paiements 100% Mobile Money.
            </p>
            <div className="flex gap-3 mt-4">
              {["🇨🇮", "🇸🇳", "🇨🇲", "🇬🇭", "🇳🇬", "🇰🇪"].map(f => (
                <span key={f} className="text-xl">{f}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Produit</div>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li><button onClick={() => setLocation("/register")} className="hover:text-white transition-colors">S'inscrire</button></li>
              <li><button onClick={() => setLocation("/login")} className="hover:text-white transition-colors">Se connecter</button></li>
              <li><a href="#services" className="hover:text-white transition-colors">Services</a></li>
              <li><a href="#operateurs" className="hover:text-white transition-colors">Opérateurs</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Ressources</div>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li><a href="#comment" className="hover:text-white transition-colors">Comment ça marche</a></li>
              <li><a href="#securite" className="hover:text-white transition-colors">Sécurité</a></li>
              <li><span className="cursor-default">FAQ</span></li>
              <li><span className="cursor-default">Support</span></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Paiements acceptés</div>
            <div className="grid grid-cols-2 gap-1.5">
              {OPERATORS.slice(0, 6).map(op => (
                <div key={op.name} className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: op.color }} />
                  {op.name.split(" ")[0]}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-zinc-800/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-zinc-600">© 2025 Simix. Tous droits réservés.</p>
          <div className="flex gap-4 text-xs text-zinc-600">
            <span className="hover:text-zinc-400 cursor-pointer transition-colors">Confidentialité</span>
            <span className="hover:text-zinc-400 cursor-pointer transition-colors">CGU</span>
            <span className="hover:text-zinc-400 cursor-pointer transition-colors">Mentions légales</span>
          </div>
          <p className="text-xs text-zinc-700">Made with 🤍 for Africa</p>
        </div>
      </Section>
    </footer>
  );
}

/* ─── Main export ─── */
export default function Landing() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe();

  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  return (
    <div className="min-h-[100dvh] bg-black text-white overflow-x-hidden">
      <Navbar />
      <Hero />
      <StatsBar />
      <CountriesTicker />
      <HowItWorks />
      <PaymentOperators />
      <AppShowcase />
      <AfricaVision />
      <ServicesGrid />
      <Security />
      <FinalCTA />
      <Footer />
    </div>
  );
}
