import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { SimixLogo } from "@/components/simix-logo";
import { ServiceIcon } from "@/components/service-icon";
import phone3d from "@/assets/simix_phone_3d.png";
import wallet3d from "@/assets/simix_wallet_3d.png";
import screenDash from "@/assets/screen-dashboard.png";
import screenWallet from "@/assets/screen-wallet.png";
import screenCountries from "@/assets/screen-countries.png";
import {
  Shield, Zap, Globe, Smartphone,
  ArrowRight, ChevronRight, MessageSquare, Users,
  Wifi, CheckCircle, Lock,
} from "lucide-react";

/* ─── Icon 3D paths (public folder) ─── */
const I = {
  stepGlobe:    "/3d/step-globe.png",
  stepPhone:    "/3d/step-phone.png",
  stepPayment:  "/3d/step-payment.png",
  iconLock:     "/3d/icon-lock.png",
  iconEye:      "/3d/icon-eye.png",
  iconShield:   "/3d/icon-shield.png",
  iconRefresh:  "/3d/icon-refresh.png",
  iconClock:    "/3d/icon-clock.png",
  iconCheck:    "/3d/icon-check.png",
  iconLightning:"/3d/icon-lightning.png",
};

/* ─── Animated counter hook ─── */
function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const triggered = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered.current) {
          triggered.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setCount(Math.round(eased * target));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);
  return { count, ref };
}

/* ─── Data ─── */
const AFRICA_COUNTRIES = [
  { code: "dz", name: "Algérie" },
  { code: "ao", name: "Angola" },
  { code: "bj", name: "Bénin" },
  { code: "bw", name: "Botswana" },
  { code: "bf", name: "Burkina Faso" },
  { code: "bi", name: "Burundi" },
  { code: "cm", name: "Cameroun" },
  { code: "cv", name: "Cap-Vert" },
  { code: "cf", name: "Centrafrique" },
  { code: "td", name: "Tchad" },
  { code: "km", name: "Comores" },
  { code: "cg", name: "Congo" },
  { code: "cd", name: "Congo RDC" },
  { code: "ci", name: "Côte d'Ivoire" },
  { code: "dj", name: "Djibouti" },
  { code: "eg", name: "Égypte" },
  { code: "gq", name: "Guinée Équatoriale" },
  { code: "er", name: "Érythrée" },
  { code: "sz", name: "Eswatini" },
  { code: "et", name: "Éthiopie" },
  { code: "ga", name: "Gabon" },
  { code: "gm", name: "Gambie" },
  { code: "gh", name: "Ghana" },
  { code: "gn", name: "Guinée" },
  { code: "gw", name: "Guinée-Bissau" },
  { code: "ke", name: "Kenya" },
  { code: "ls", name: "Lesotho" },
  { code: "lr", name: "Liberia" },
  { code: "ly", name: "Libye" },
  { code: "mg", name: "Madagascar" },
  { code: "mw", name: "Malawi" },
  { code: "ml", name: "Mali" },
  { code: "ma", name: "Maroc" },
  { code: "mr", name: "Mauritanie" },
  { code: "mu", name: "Maurice" },
  { code: "mz", name: "Mozambique" },
  { code: "na", name: "Namibie" },
  { code: "ne", name: "Niger" },
  { code: "ng", name: "Nigéria" },
  { code: "ug", name: "Ouganda" },
  { code: "rw", name: "Rwanda" },
  { code: "st", name: "Sao Tomé" },
  { code: "sn", name: "Sénégal" },
  { code: "sc", name: "Seychelles" },
  { code: "sl", name: "Sierra Leone" },
  { code: "so", name: "Somalie" },
  { code: "za", name: "Afrique du Sud" },
  { code: "sd", name: "Soudan" },
  { code: "ss", name: "Soudan du Sud" },
  { code: "tz", name: "Tanzanie" },
  { code: "tg", name: "Togo" },
  { code: "tn", name: "Tunisie" },
  { code: "zm", name: "Zambie" },
  { code: "zw", name: "Zimbabwe" },
];

const OPERATORS = [
  { name: "Orange Money", abbr: "OM", color: "#FF7A00", countries: "CI · SN · ML · BF · CM · GN · MR · MG", bg: "#FF7A00",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><circle cx="16" cy="16" r="14" fill="#FF7A00"/><circle cx="16" cy="16" r="7" fill="#fff" opacity="0.95"/></svg> },
  { name: "MTN Mobile Money", abbr: "MTN", color: "#FFCC00", countries: "GH · NG · CI · CM · UG · RW · BJ · GN", bg: "#1A1A1A",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#FFCC00"/><text x="16" y="21" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="10" fill="#1A1A1A">MTN</text></svg> },
  { name: "Wave", abbr: "WV", color: "#1BC5F4", countries: "SN · CI · BF · ML · GN · GM", bg: "#1BC5F4",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#1BC5F4"/><path d="M6 18 Q10 12 16 16 Q22 20 26 14" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"/></svg> },
  { name: "Moov Money", abbr: "MV", color: "#E2001A", countries: "CI · BF · TG · BJ · NE · MG", bg: "#E2001A",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#E2001A"/><text x="16" y="22" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="800" fontSize="9.5" fill="#fff">MOOV</text></svg> },
  { name: "M-Pesa", abbr: "MP", color: "#4CAF50", countries: "KE · TZ · MZ · UG · RW · GH · CD", bg: "#4CAF50",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#4CAF50"/><text x="16" y="14" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="8" fill="#fff">M-</text><text x="16" y="24" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="8" fill="#fff">PESA</text></svg> },
  { name: "Airtel Money", abbr: "AM", color: "#E40000", countries: "KE · NG · UG · TZ · ZM · MW · MG", bg: "#E40000",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#E40000"/><path d="M16 8 L8 24 L16 20 L24 24 Z" fill="#fff" opacity="0.9"/></svg> },
  { name: "Free Money", abbr: "FM", color: "#E30613", countries: "Sénégal", bg: "#E30613",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#E30613"/><text x="16" y="22" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="10" fill="#fff">FM</text></svg> },
  { name: "EcoCash", abbr: "EC", color: "#F7941D", countries: "Zimbabwe", bg: "#F7941D",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#F7941D"/><text x="16" y="22" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="8.5" fill="#fff">ECO</text></svg> },
  { name: "Zamtel Kwacha", abbr: "ZK", color: "#007EC4", countries: "Zambie", bg: "#007EC4",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#007EC4"/><text x="16" y="22" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="10" fill="#fff">ZK</text></svg> },
  { name: "Vodacom M-Pesa", abbr: "VM", color: "#E60000", countries: "TZ · MZ · CD · LS", bg: "#E60000",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#E60000"/><circle cx="16" cy="16" r="8" fill="#fff" opacity="0.15"/><text x="16" y="21" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="9" fill="#fff">VDF</text></svg> },
  { name: "Tigo Pesa", abbr: "TP", color: "#0078C8", countries: "TZ · GH · SN", bg: "#0078C8",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#0078C8"/><text x="16" y="22" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="9" fill="#fff">TIGO</text></svg> },
  { name: "Equitel", abbr: "EQ", color: "#00A651", countries: "Kenya", bg: "#00A651",
    svg: <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" rx="6" fill="#00A651"/><text x="16" y="22" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="8.5" fill="#fff">EQL</text></svg> },
];

const SERVICES = [
  { name: "WhatsApp", slug: "whatsapp", color: "#25D366", logoUrl: null },
  { name: "Telegram", slug: "telegram", color: "#2AABEE", logoUrl: null },
  { name: "Google", slug: "google", color: "#4285F4", logoUrl: null },
  { name: "Facebook", slug: "facebook", color: "#1877F2", logoUrl: null },
  { name: "Instagram", slug: "instagram", color: "#E1306C", logoUrl: null },
  { name: "TikTok", slug: "tiktok", color: "#FF0050", logoUrl: null },
  { name: "X / Twitter", slug: "x", color: "#1a1a1a", logoUrl: null },
  { name: "Discord", slug: "discord", color: "#5865F2", logoUrl: null },
  { name: "Snapchat", slug: "snapchat", color: "#FFFC00", logoUrl: null },
  { name: "Microsoft", slug: "microsoft", color: "#0078D4", logoUrl: null },
  { name: "Netflix", slug: "netflix", color: "#E50914", logoUrl: "https://cdn.simpleicons.org/netflix/E50914" },
  { name: "Amazon", slug: "amazon", color: "#FF9900", logoUrl: null },
  { name: "PayPal", slug: "paypal", color: "#003087", logoUrl: "https://cdn.simpleicons.org/paypal/003087" },
  { name: "Binance", slug: "binance", color: "#F3BA2F", logoUrl: "https://cdn.simpleicons.org/binance/F3BA2F" },
  { name: "Spotify", slug: "spotify", color: "#1DB954", logoUrl: "https://cdn.simpleicons.org/spotify/1DB954" },
  { name: "Uber", slug: "uber", color: "#000000", logoUrl: "https://cdn.simpleicons.org/uber/FFFFFF" },
  { name: "LinkedIn", slug: "linkedin", color: "#0077B5", logoUrl: null },
  { name: "Steam", slug: "steam", color: "#1b2838", logoUrl: "https://cdn.simpleicons.org/steam/FFFFFF" },
  { name: "Coinbase", slug: "coinbase", color: "#0052FF", logoUrl: "https://cdn.simpleicons.org/coinbase/0052FF" },
  { name: "Airbnb", slug: "airbnb", color: "#FF5A5F", logoUrl: "https://cdn.simpleicons.org/airbnb/FF5A5F" },
  { name: "Booking.com", slug: "booking", color: "#003580", logoUrl: "https://cdn.simpleicons.org/bookingdotcom/FFFFFF" },
  { name: "Shein", slug: "shein", color: "#000000", logoUrl: null },
  { name: "OLX", slug: "olx", color: "#3F2A8F", logoUrl: null },
  { name: "+500 autres", slug: "", color: "#7C3AED", logoUrl: null },
];

const STEPS = [
  {
    number: "01",
    imgSrc: I.stepGlobe,
    title: "Choisissez un pays et un service",
    desc: "Sélectionnez le pays du numéro désiré parmi 54 nations africaines et au-delà, puis choisissez le service à vérifier.",
    color: "#7C3AED",
  },
  {
    number: "02",
    imgSrc: I.stepPhone,
    title: "Obtenez votre numéro virtuel",
    desc: "Un numéro temporaire vous est attribué instantanément. Utilisez-le pour recevoir votre code de vérification SMS.",
    color: "#EC4899",
  },
  {
    number: "03",
    imgSrc: I.stepPayment,
    title: "Payez via Mobile Money en FCFA",
    desc: "Rechargez votre solde avec Orange Money, MTN, Wave ou tout autre opérateur local. Aucune carte bancaire requise.",
    color: "#F59E0B",
  },
];

const SECURITY_FEATURES = [
  { imgSrc: I.iconLock,    title: "Chiffrement bout en bout", desc: "Vos données et transactions sont chiffrées avec les standards les plus élevés." },
  { imgSrc: I.iconEye,     title: "Numéros éphémères", desc: "Chaque numéro est temporaire et détruit après usage. Aucun historique conservé." },
  { imgSrc: I.iconShield,  title: "Aucune carte bancaire", desc: "Uniquement du Mobile Money local. Vos coordonnées bancaires ne sont jamais sollicitées." },
  { imgSrc: I.iconRefresh, title: "Remboursement garanti", desc: "Si aucun SMS n'est reçu dans les délais, votre solde est remboursé automatiquement." },
  { imgSrc: I.iconClock,   title: "Disponible 24h/24", desc: "Plateforme opérationnelle à toute heure, tous les jours de l'année, sans interruption." },
  { imgSrc: I.iconCheck,   title: "Numéros vérifiés actifs", desc: "Chaque numéro est testé et vérifié avant d'être proposé à la vente." },
];

const TESTIMONIALS = [
  {
    name: "Kofi Mensah",
    role: "Développeur web, Accra",
    flag: "gh",
    initials: "KM",
    color: "#7C3AED",
    text: "En tant que développeur, j'avais besoin de plusieurs comptes pour tester mes applications. Simix m'a sauvé la mise. Paiement MTN MoMo instantané, numéro reçu en 20 secondes chrono.",
    stars: 5,
  },
  {
    name: "Aminata Diallo",
    role: "Entrepreneuse, Dakar",
    flag: "sn",
    initials: "AD",
    color: "#EC4899",
    text: "J'avais du mal à vérifier mon WhatsApp Business avec mon numéro principal. Simix m'a fourni un numéro valide instantanément. Payé avec Wave sans la moindre complication. Service impeccable.",
    stars: 5,
  },
  {
    name: "Chukwuemeka Obi",
    role: "Trader crypto, Lagos",
    flag: "ng",
    initials: "CO",
    color: "#F59E0B",
    text: "Pour vérifier Binance et Coinbase, Simix est parfait. Numéro livré en temps record, SMS reçu aussitôt. Service fiable à prix raisonnable. Je l'utilise chaque semaine sans problème.",
    stars: 5,
  },
];

const FAQ_ITEMS = [
  {
    q: "Comment fonctionne Simix exactement ?",
    a: "Simix vous fournit des numéros de téléphone virtuels temporaires. Utilisez-les pour recevoir des codes SMS de vérification depuis n'importe quel service (WhatsApp, Google, Binance...), puis payez via votre Mobile Money local en FCFA.",
  },
  {
    q: "Quels opérateurs Mobile Money sont acceptés ?",
    a: "Nous acceptons Orange Money, MTN MoMo, Wave, Moov Money, M-Pesa, Airtel Money, Free Money et bien d'autres — soit plus de 11 opérateurs couvrant 54 pays africains. Aucune carte bancaire requise.",
  },
  {
    q: "Que se passe-t-il si je ne reçois pas le SMS ?",
    a: "Si aucun SMS n'est reçu dans les délais impartis, votre solde est remboursé automatiquement. Nous vous proposons également un autre numéro pour réessayer sans frais supplémentaires.",
  },
  {
    q: "Combien de temps le numéro reste-t-il actif ?",
    a: "Les numéros sont actifs 10 à 30 minutes — suffisant pour recevoir votre code. Une fois le SMS reçu, le numéro expire automatiquement pour préserver votre confidentialité.",
  },
  {
    q: "Puis-je utiliser Simix sans carte bancaire ?",
    a: "Absolument. Simix est conçu exclusivement pour les paiements Mobile Money africains. Payez en FCFA, KES, GHS, NGN et toutes les devises locales. Aucune carte bancaire internationale n'est requise.",
  },
  {
    q: "Est-ce légal d'utiliser des numéros virtuels ?",
    a: "Oui, totalement légal. Les services de numéros virtuels SMS sont légaux et utilisés dans le monde entier pour la vérification d'identité en ligne. Simix opère en conformité totale avec les réglementations locales.",
  },
];

/* ─── Flag image ─── */
function FlagImg({ code, size = 24 }: { code: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err) {
    return <span className="text-base">{String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))}</span>;
  }
  return (
    <img
      src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/48x36/${code.toLowerCase()}.png 2x`}
      alt={code}
      onError={() => setErr(true)}
      style={{ width: size, height: Math.round(size * 0.75) }}
      className="object-cover rounded-sm flex-shrink-0"
    />
  );
}

/* ─── Service logo for landing grid ─── */
function LandingServiceIcon({ service }: { service: typeof SERVICES[0] }) {
  const [err, setErr] = useState(false);
  const knownSlugs = ["whatsapp","telegram","facebook","instagram","tiktok","x","discord","snapchat","signal","apple","google","microsoft"];

  if (!service.slug) {
    return (
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: "linear-gradient(135deg,#7C3AED,#6366F1)" }}>
        +
      </div>
    );
  }

  if (knownSlugs.includes(service.slug)) {
    return <ServiceIcon name={service.name} slug={service.slug} size={48} rounded="xl" />;
  }

  if (service.logoUrl && !err) {
    const darkBg = ["uber","steam","shein","olx","booking"].includes(service.slug);
    return (
      <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden p-2 flex-shrink-0" style={{ background: darkBg ? service.color : "#fff" }}>
        <img src={service.logoUrl} alt={service.name} onError={() => setErr(true)} className="w-full h-full object-contain" />
      </div>
    );
  }

  return (
    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl" style={{ background: service.color }}>
      {service.name.charAt(0)}
    </div>
  );
}

/* ─── Section wrapper ─── */
function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`px-4 sm:px-8 lg:px-16 xl:px-24 ${className}`}>{children}</section>;
}

/* ─── Section label pill ─── */
function SectionPill({ label, color = "violet" }: { label: string; color?: "violet" | "amber" | "pink" | "emerald" | "sky" }) {
  const cls: Record<string, string> = {
    violet: "bg-violet-600/10 border-violet-600/25 text-violet-400",
    amber:  "bg-amber-500/10  border-amber-500/25  text-amber-400",
    pink:   "bg-pink-600/10   border-pink-600/25   text-pink-400",
    emerald:"bg-emerald-600/10 border-emerald-600/25 text-emerald-400",
    sky:    "bg-sky-600/10    border-sky-600/25    text-sky-400",
  };
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-1.5 border rounded-full text-xs font-semibold uppercase tracking-widest mb-3 ${cls[color]}`}>
      {label}
    </div>
  );
}

/* ─── Countries ticker ─── */
function CountriesTicker() {
  const doubled = [...AFRICA_COUNTRIES, ...AFRICA_COUNTRIES];
  const doubled2 = [...AFRICA_COUNTRIES, ...AFRICA_COUNTRIES];
  return (
    <div className="py-8 overflow-hidden border-y border-zinc-800/60 bg-zinc-950/50">
      <div className="flex items-center gap-6 mb-3 px-4 sm:px-8 lg:px-16 xl:px-24">
        <span className="text-zinc-400 text-sm font-semibold uppercase tracking-widest whitespace-nowrap">54 pays africains couverts</span>
        <div className="h-px flex-1 bg-gradient-to-r from-violet-600/40 to-transparent" />
      </div>
      <div className="overflow-hidden mb-2.5">
        <div className="marquee-track">
          {doubled.map((c, i) => (
            <div key={i} className="flex items-center gap-2.5 px-4 py-2 mx-1.5 bg-zinc-900/80 border border-zinc-800/60 rounded-full whitespace-nowrap flex-shrink-0">
              <FlagImg code={c.code} size={22} />
              <span className="text-sm text-zinc-300 font-medium">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden">
        <div className="marquee-track-reverse">
          {doubled2.map((c, i) => (
            <div key={i} className="flex items-center gap-2.5 px-4 py-2 mx-1.5 bg-zinc-900/60 border border-violet-900/30 rounded-full whitespace-nowrap flex-shrink-0">
              <FlagImg code={c.code} size={22} />
              <span className="text-sm text-zinc-400 font-medium">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Operators ticker ─── */
function OperatorsTicker() {
  return (
    <div className="py-5 overflow-hidden bg-zinc-950/30">
      <div className="overflow-hidden mb-2.5">
        <div className="marquee-track">
          {[0, 1, 2, 3].map((k) => (
            <img key={k} src="/operator-logos.png" alt="Opérateurs Mobile Money" className="h-10 object-contain flex-shrink-0 mx-8 select-none" draggable={false} />
          ))}
        </div>
      </div>
      <div className="overflow-hidden">
        <div className="marquee-track-reverse">
          {[0, 1, 2, 3].map((k) => (
            <img key={k} src="/operator-logos.png" alt="Opérateurs Mobile Money" className="h-10 object-contain flex-shrink-0 mx-8 select-none opacity-70" draggable={false} />
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
            Commencer gratuitement
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
    <div className="relative landing-grid overflow-hidden pt-28 pb-14">
      <div className="glow-orb absolute -top-20 -left-20 w-[600px] h-[600px] bg-violet-600/15" />
      <div className="glow-orb absolute top-1/2 -right-40 w-[500px] h-[400px] bg-purple-800/20" />
      <div className="glow-orb absolute bottom-0 left-1/3 w-[400px] h-[300px] bg-pink-900/15" />

      <Section className="relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600/15 border border-violet-600/30 rounded-full text-violet-300 text-sm font-medium mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Fintech 100% Africaine — Paiements Mobile Money
            </div>

            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold leading-[1.1] text-white mb-5">
              Recevez vos{" "}
              <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                codes SMS
              </span>{" "}
              depuis n'importe quel service,{" "}
              <span className="text-violet-400">partout en Afrique.</span>
            </h1>

            <p className="text-base text-zinc-400 leading-relaxed mb-7 max-w-xl">
              Des numéros virtuels temporaires pour vérifier vos comptes WhatsApp, Telegram, Google et bien plus —
              payés en <strong className="text-white">FCFA via Orange Money, MTN, Wave</strong> et tous les opérateurs Mobile Money du continent.
            </p>

            <div className="flex flex-wrap gap-3 mb-5">
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

            <div className="flex items-center gap-3 mb-6">
              <div className="flex -space-x-2">
                {["ci","sn","gh","ng","ke"].map(c => (
                  <div key={c} className="w-8 h-8 rounded-full border-2 border-black overflow-hidden flex-shrink-0 bg-zinc-800">
                    <FlagImg code={c} size={32} />
                  </div>
                ))}
              </div>
              <div className="text-xs text-zinc-400 leading-tight">
                <span className="text-white font-semibold">5 000+</span> utilisateurs actifs en Afrique<br />
                <span className="text-amber-400">★★★★★</span>{" "}
                <span className="text-zinc-500">Note 4.8/5</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "54", label: "Pays africains", icon: <Globe className="w-5 h-5 text-violet-400" /> },
                { value: "11+", label: "Opérateurs MoMo", icon: <Smartphone className="w-5 h-5 text-pink-400" /> },
                { value: "500+", label: "Services supportés", icon: <CheckCircle className="w-5 h-5 text-emerald-400" /> },
              ].map((s, i) => (
                <div key={i} className="text-center p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                  <div className="flex justify-center mb-1">{s.icon}</div>
                  <div className="text-xl font-bold text-white">{s.value}</div>
                  <div className="text-xs text-zinc-500 leading-tight">{s.label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="hidden lg:flex items-center justify-center relative"
          >
            <div className="relative w-full max-w-[440px] h-[500px]">
              <div className="absolute left-1/2 -translate-x-1/2 top-0 z-10 float-slow">
                <img src={phone3d} alt="Simix App" className="w-[240px] drop-shadow-2xl" />
              </div>
              <div className="absolute right-0 top-24 z-20 float-fast">
                <div className="glass rounded-2xl overflow-hidden shadow-2xl shadow-violet-900/30 w-[130px]">
                  <img src={screenDash} alt="Dashboard" className="w-full" />
                </div>
              </div>
              <div className="absolute left-0 bottom-8 z-20 float-slow" style={{ animationDelay: "1s" }}>
                <div className="glass rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/30 w-[120px]">
                  <img src={screenWallet} alt="Wallet" className="w-full" />
                </div>
              </div>
              <div className="absolute right-4 bottom-28 z-30">
                <div className="glass px-4 py-2.5 rounded-2xl shadow-lg border border-emerald-500/20 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div>
                    <div className="text-xs font-semibold text-white">SMS reçu</div>
                    <div className="text-[10px] text-zinc-400">Code : <span className="text-emerald-400 font-mono font-bold">847291</span></div>
                  </div>
                </div>
              </div>
              <div className="absolute left-4 top-20 z-30">
                <div className="glass px-3 py-2 rounded-xl shadow-lg border border-amber-500/20 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
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

    </div>
  );
}

/* ─── Animated stat item ─── */
function AnimatedStat({ target, suffix = "", icon, label }: { target: number; suffix?: string; icon: React.ReactNode; label: string }) {
  const { count, ref } = useCountUp(target, 1800);
  return (
    <div ref={ref} className="flex flex-col items-center py-5 gap-1.5 text-center px-3">
      {icon}
      <div className="text-xl font-extrabold text-white tabular-nums">{count}{suffix}</div>
      <div className="text-xs text-zinc-500 leading-tight">{label}</div>
    </div>
  );
}

/* ─── Stats bar ─── */
function StatsBar() {
  return (
    <div className="border-y border-zinc-800/60 bg-zinc-950/80">
      <Section>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-zinc-800/40">
          <AnimatedStat target={54} icon={<Globe className="w-5 h-5 text-violet-400" />} label="Pays africains couverts" />
          <AnimatedStat target={11} suffix="+" icon={<Smartphone className="w-5 h-5 text-pink-400" />} label="Opérateurs Mobile Money" />
          <AnimatedStat target={500} suffix="+" icon={<MessageSquare className="w-5 h-5 text-emerald-400" />} label="Services vérifiables" />
          <div className="flex flex-col items-center py-5 gap-1.5 text-center px-3">
            <Zap className="w-5 h-5 text-amber-400" />
            <div className="text-xl font-extrabold text-white">&lt; 30s</div>
            <div className="text-xs text-zinc-500 leading-tight">Réception du SMS</div>
          </div>
          <AnimatedStat target={100} suffix="%" icon={<Shield className="w-5 h-5 text-sky-400" />} label="Paiement Mobile Money" />
          <div className="flex flex-col items-center py-5 gap-1.5 text-center px-3">
            <Lock className="w-5 h-5 text-rose-400" />
            <div className="text-xl font-extrabold text-white">SSL</div>
            <div className="text-xs text-zinc-500 leading-tight">Connexion sécurisée</div>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ─── How it works ─── */
function HowItWorks() {
  return (
    <Section className="py-14" id="comment">
      <div className="text-center mb-10">
        <SectionPill label="Simple et rapide" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Comment ça marche ?</h2>
        <p className="text-zinc-400 text-base max-w-2xl mx-auto">
          En 3 étapes simples, obtenez votre numéro et recevez votre code SMS depuis n'importe quel service.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 relative">
        <div className="hidden md:block absolute top-16 left-[22%] right-[22%] h-px bg-gradient-to-r from-violet-600/40 via-pink-600/40 to-amber-500/40" />
        {STEPS.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors group"
          >
            <div className="absolute -top-3 left-6">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full text-white" style={{ backgroundColor: step.color }}>
                {step.number}
              </span>
            </div>
            {/* 3D icon */}
            <div className="w-16 h-16 mb-4 mt-2 flex items-center justify-center">
              <img
                src={step.imgSrc}
                alt={step.title}
                className="w-full h-full object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">{step.desc}</p>
            {/* bottom accent */}
            <div className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full opacity-40 transition-opacity group-hover:opacity-80" style={{ backgroundColor: step.color }} />
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ─── Payment Operators ─── */
function PaymentOperators() {
  return (
    <div id="operateurs" className="py-14 bg-gradient-to-b from-transparent via-zinc-950/50 to-transparent">
      <Section>
        <div className="text-center mb-10">
          <SectionPill label="Mobile Money" color="amber" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Payez avec votre opérateur local</h2>
          <p className="text-zinc-400 text-base max-w-2xl mx-auto">
            Tous les grands opérateurs Mobile Money d'Afrique acceptés. Aucune carte bancaire, aucune devise étrangère requise.
          </p>
        </div>
      </Section>

      <OperatorsTicker />

      <Section className="mt-8">
        <div className="text-center">
          <p className="text-zinc-500 text-sm">
            Disponible dans <strong className="text-white">54 pays africains</strong> — Paiements en{" "}
            <strong className="text-violet-400">FCFA, KES, GHS, NGN</strong> et toutes monnaies locales
          </p>
        </div>
      </Section>
    </div>
  );
}

/* ─── App showcase ─── */
function AppShowcase() {
  return (
    <div className="py-14 overflow-hidden bg-gradient-to-b from-violet-950/10 via-purple-950/5 to-transparent">
      <Section>
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <SectionPill label="Interface intuitive" color="pink" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              Une application pensée pour <span className="text-violet-400">l'Afrique</span>
            </h2>
            <p className="text-zinc-400 text-base leading-relaxed mb-6">
              Interface claire, légère et optimisée pour les connexions mobiles africaines. Fonctionne même avec une connexion 3G.
            </p>
            <ul className="space-y-3">
              {[
                { icon: <Smartphone className="w-4 h-4" />, text: "Interface mobile-first, compatible tous smartphones" },
                { icon: <Wifi className="w-4 h-4" />, text: "Optimisé pour les réseaux 3G et 4G africains" },
                { icon: <Globe className="w-4 h-4" />, text: "Disponible en français et anglais, couvrant 54 pays africains" },
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

/* ─── Animated stat for Africa section ─── */
function AfricaStat({ target, suffix, label, color }: { target: number; suffix: string; label: string; color: string }) {
  const { count, ref } = useCountUp(target, 1800);
  return (
    <div ref={ref} className="glass p-4 rounded-xl">
      <div className={`text-2xl font-extrabold mb-1 tabular-nums ${color}`}>{count}{suffix}</div>
      <div className="text-xs text-zinc-400 leading-tight">{label}</div>
    </div>
  );
}

/* ─── Africa Vision ─── */
function AfricaVision() {
  return (
    <Section className="py-14">
      <div className="relative rounded-3xl overflow-hidden border border-zinc-800/60">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?w=1400&q=80&auto=format&fit=crop)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/85 to-black/60" />
        <div className="relative z-10 p-7 sm:p-10 lg:p-14 grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <SectionPill label="Notre vision pour l'Afrique" color="amber" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
              L'inclusion numérique,{" "}
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                accessible à tous les Africains
              </span>
            </h2>
            <p className="text-zinc-300 text-sm leading-relaxed mb-4">
              Le Mobile Money est le principal outil financier de centaines de millions d'Africains.
              Pourtant, la plupart des plateformes numériques exigent une vérification SMS difficile à accomplir sans numéro adapté.
            </p>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              Simix supprime cette barrière. Chaque Africain peut accéder à l'économie numérique mondiale
              sans carte bancaire, sans devise étrangère, et sans complications.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <AfricaStat target={54} suffix="" label="Nations africaines couvertes" color="text-violet-400" />
              <AfricaStat target={11} suffix="+" label="Opérateurs Mobile Money" color="text-amber-400" />
              <div className="glass p-4 rounded-xl">
                <div className="text-2xl font-extrabold mb-1 text-emerald-400">Gratuit</div>
                <div className="text-xs text-zinc-400 leading-tight">Création de compte sans frais</div>
              </div>
              <div className="glass p-4 rounded-xl">
                <div className="text-2xl font-extrabold mb-1 text-pink-400">&lt; 30s</div>
                <div className="text-xs text-zinc-400 leading-tight">Temps moyen de livraison SMS</div>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex justify-center items-center">
            <div className="relative">
              <div className="float-slow">
                <img src={wallet3d} alt="Simix Wallet" className="w-60 drop-shadow-2xl" />
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
    <Section className="py-14" id="services">
      <div className="text-center mb-10">
        <SectionPill label="Plus de 500 plateformes" color="emerald" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Vérifiez n'importe quel service</h2>
        <p className="text-zinc-400 text-base max-w-2xl mx-auto">
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
            className="service-card group relative flex flex-col items-center gap-2 p-4 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 cursor-default overflow-hidden"
            style={{ borderTopColor: `${s.color}30` }}
          >
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity"
              style={{ background: `radial-gradient(circle at center, ${s.color}, transparent)` }}
            />
            <div className="relative z-10 flex-shrink-0">
              <LandingServiceIcon service={s} />
            </div>
            <span className="text-xs font-semibold text-center leading-tight relative z-10 text-zinc-300">{s.name}</span>
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
    <Section className="py-14" id="securite">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        {/* Left: text + 3D shield illustration */}
        <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
          <SectionPill label="Confiance et Sécurité" color="sky" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Votre sécurité,{" "}
            <span className="text-sky-400">notre priorité absolue</span>
          </h2>
          <p className="text-zinc-400 text-base leading-relaxed mb-5">
            Chaque transaction, chaque numéro, chaque SMS est protégé par des protocoles de sécurité de niveau bancaire.
          </p>
          <div className="flex flex-wrap gap-2.5 mb-7">
            {["Chiffrement SSL/TLS", "Numéros éphémères", "RGPD Compliant", "2FA disponible"].map(tag => (
              <span key={tag} className="px-3 py-1.5 text-xs font-semibold bg-sky-600/10 border border-sky-600/20 text-sky-400 rounded-full">{tag}</span>
            ))}
          </div>
          {/* 3D shield illustration */}
          <div className="flex justify-center lg:justify-start">
            <div className="relative float-slow">
              <img src={I.iconShield} alt="Sécurité" className="w-36 h-36 object-contain drop-shadow-2xl" />
              <div className="absolute inset-0 rounded-full bg-sky-500/10 blur-2xl -z-10" />
            </div>
          </div>
        </motion.div>

        {/* Right: feature cards with 3D icons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SECURITY_FEATURES.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className="flex gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group"
            >
              <div className="w-10 h-10 flex-shrink-0 group-hover:scale-110 transition-transform">
                <img src={f.imgSrc} alt={f.title} className="w-full h-full object-contain drop-shadow-md" />
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

/* ─── Testimonials ─── */
function Testimonials() {
  return (
    <Section className="py-14">
      <div className="text-center mb-10">
        <SectionPill label="Ils nous font confiance" color="emerald" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Ce qu'ils disent de Simix</h2>
        <p className="text-zinc-400 text-base max-w-2xl mx-auto">
          Des milliers d'Africains utilisent Simix chaque jour pour accéder aux services numériques du monde entier.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {TESTIMONIALS.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12 }}
            className="flex flex-col gap-4 p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all"
          >
            <div className="flex text-amber-400 text-base gap-0.5 leading-none">
              {"★".repeat(t.stars)}
            </div>
            <p className="text-zinc-300 text-sm leading-relaxed flex-1">"{t.text}"</p>
            <div className="flex items-center gap-3 pt-3 border-t border-zinc-800/60">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg"
                style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}88)` }}
              >
                {t.initials}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-white">{t.name}</span>
                  <FlagImg code={t.flag} size={16} />
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">{t.role}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-zinc-500">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span>5 000+ utilisateurs actifs</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-sky-500" />
          <span>Paiements 100% sécurisés</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <span>SMS reçu en moins de 30 secondes</span>
        </div>
      </div>
    </Section>
  );
}

/* ─── FAQ ─── */
function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Section className="py-14">
      <div className="text-center mb-10">
        <SectionPill label="Questions fréquentes" color="violet" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Vos questions, nos réponses</h2>
        <p className="text-zinc-400 text-base max-w-2xl mx-auto">
          Tout ce que vous devez savoir avant de commencer avec Simix.
        </p>
      </div>
      <div className="max-w-2xl mx-auto space-y-3">
        {FAQ_ITEMS.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 overflow-hidden"
          >
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-zinc-800/40 transition-colors"
            >
              <span className="text-sm font-semibold text-white">{item.q}</span>
              <ChevronRight
                className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform duration-200 ${open === i ? "rotate-90 text-violet-400" : ""}`}
              />
            </button>
            {open === i && (
              <div className="px-5 pb-4 text-sm text-zinc-400 leading-relaxed border-t border-zinc-800/40 pt-3">
                {item.a}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ─── Final CTA ─── */
function FinalCTA() {
  const [, setLocation] = useLocation();
  return (
    <Section className="py-14">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative rounded-3xl overflow-hidden border border-violet-800/30 p-8 sm:p-12 text-center"
        style={{ background: "linear-gradient(135deg, #1e0a3c, #0a0a12, #0d0520)" }}
      >
        <div className="glow-orb absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-violet-600/20" />
        <div className="relative z-10">
          {/* 3D lightning icon */}
          <div className="flex justify-center mb-5">
            <div className="relative">
              <img src={I.iconLightning} alt="Rapide" className="w-20 h-20 object-contain drop-shadow-2xl float-slow" />
              <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-2xl -z-10" />
            </div>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 leading-tight">
            Votre numéro virtuel,<br />
            <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
              prêt en quelques secondes
            </span>
          </h2>
          <p className="text-zinc-400 text-base max-w-xl mx-auto mb-8 leading-relaxed">
            Inscription gratuite. Aucune carte bancaire.
            Payez uniquement avec votre Mobile Money local.
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
          <p className="text-zinc-600 text-xs mt-5 flex items-center justify-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            Inscription gratuite · Aucune carte requise · Paiement Mobile Money
          </p>
        </div>
      </motion.div>
    </Section>
  );
}

/* ─── Footer operator badge ─── */
function FooterOpBadge({ op }: { op: typeof OPERATORS[0] }) {
  const shortName = op.name
    .replace("Mobile Money", "MoMo")
    .replace(" Money", "")
    .replace("Vodacom ", "");
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
        {op.svg}
      </div>
      <span className="text-xs text-zinc-400 leading-tight">{shortName}</span>
    </div>
  );
}

/* ─── Footer ─── */
function Footer() {
  const [, setLocation] = useLocation();
  return (
    <footer className="border-t border-zinc-800/60 bg-zinc-950/80">
      <Section className="py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-7 mb-8">
          <div className="col-span-2 md:col-span-1">
            <SimixLogo size={24} />
            <p className="text-zinc-500 text-sm mt-3 leading-relaxed max-w-xs">
              La plateforme de numéros virtuels SMS pensée pour les Africains. Paiements 100% Mobile Money.
            </p>
            <div className="flex gap-2 mt-4 flex-wrap">
              {["ci","sn","cm","gh","ng","ke"].map(code => (
                <FlagImg key={code} code={code} size={28} />
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
            <div className="flex flex-col gap-2">
              {OPERATORS.slice(0, 6).map(op => (
                <FooterOpBadge key={op.name} op={op} />
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-zinc-800/60 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-zinc-600">© 2026 Simix. Tous droits réservés.</p>
          <div className="flex gap-4 text-xs text-zinc-600">
            <span className="hover:text-zinc-400 cursor-pointer transition-colors">Confidentialité</span>
            <span className="hover:text-zinc-400 cursor-pointer transition-colors">CGU</span>
            <span className="hover:text-zinc-400 cursor-pointer transition-colors">Mentions légales</span>
          </div>
          <p className="text-xs text-zinc-600">Conçu pour l'Afrique</p>
        </div>
      </Section>
    </footer>
  );
}

/* ─── Main export ─── */
export default function Landing() {
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
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
