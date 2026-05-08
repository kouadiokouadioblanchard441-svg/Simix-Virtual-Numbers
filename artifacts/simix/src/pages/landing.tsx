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
  ArrowRight, ChevronRight, CheckCircle,
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
  { name: "WhatsApp",    slug: "whatsapp",  color: "#25D366", icon3d: "/3d/services/whatsapp.png" },
  { name: "Telegram",   slug: "telegram",  color: "#2AABEE", icon3d: "/3d/services/telegram.png" },
  { name: "Google",     slug: "google",    color: "#4285F4", icon3d: "/3d/services/google.png" },
  { name: "Facebook",   slug: "facebook",  color: "#1877F2", icon3d: "/3d/services/facebook.png" },
  { name: "Instagram",  slug: "instagram", color: "#E1306C", icon3d: "/3d/services/instagram.png" },
  { name: "TikTok",     slug: "tiktok",    color: "#FF0050", icon3d: "/3d/services/tiktok.png" },
  { name: "X / Twitter",slug: "x",         color: "#1a1a1a", icon3d: "/3d/services/x.png" },
  { name: "Discord",    slug: "discord",   color: "#5865F2", icon3d: "/3d/services/discord.png" },
  { name: "Snapchat",   slug: "snapchat",  color: "#FFFC00", icon3d: "/3d/services/snapchat.png" },
  { name: "Microsoft",  slug: "microsoft", color: "#0078D4", icon3d: "/3d/services/microsoft.png" },
  { name: "Netflix",    slug: "netflix",   color: "#E50914", icon3d: "/3d/services/netflix.png" },
  { name: "Amazon",     slug: "amazon",    color: "#FF9900", icon3d: "/3d/services/amazon.png" },
  { name: "PayPal",     slug: "paypal",    color: "#003087", icon3d: "/3d/services/paypal.png" },
  { name: "Binance",    slug: "binance",   color: "#F3BA2F", icon3d: "/3d/services/binance.png" },
  { name: "Spotify",    slug: "spotify",   color: "#1DB954", icon3d: "/3d/services/spotify.png" },
  { name: "Uber",       slug: "uber",      color: "#000000", icon3d: "/3d/services/uber.png" },
  { name: "LinkedIn",   slug: "linkedin",  color: "#0077B5", icon3d: "/3d/services/linkedin.png" },
  { name: "Steam",      slug: "steam",     color: "#1b2838", icon3d: "/3d/services/steam.png" },
  { name: "Coinbase",   slug: "coinbase",  color: "#0052FF", icon3d: "/3d/services/coinbase.png" },
  { name: "Airbnb",     slug: "airbnb",    color: "#FF5A5F", icon3d: "/3d/services/airbnb.png" },
  { name: "YouTube",    slug: "youtube",   color: "#FF0000", icon3d: "/3d/services/youtube.png" },
  { name: "Apple",      slug: "apple",     color: "#555555", icon3d: "/3d/services/apple.png" },
  { name: "Signal",     slug: "signal",    color: "#3A76F0", icon3d: "/3d/services/signal.png" },
  { name: "+500 autres",slug: "",          color: "#7C3AED", icon3d: "" },
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
    role: "Développeur web",
    city: "Accra, Ghana",
    flag: "gh",
    initials: "KM",
    color: "#7C3AED",
    avatar: "/man-3.jpg",
    text: "En tant que développeur, je teste mes apps avec plusieurs comptes. Simix m'a simplifié la vie : paiement MTN MoMo instantané, numéro reçu en moins de 20 secondes. Je l'utilise au quotidien depuis 6 mois sans aucun souci.",
    stars: 5,
    service: "WhatsApp & Binance",
    date: "Mars 2026",
  },
  {
    name: "Aminata Diallo",
    role: "Entrepreneuse",
    city: "Dakar, Sénégal",
    flag: "sn",
    initials: "AD",
    color: "#EC4899",
    avatar: "/woman-1.jpg",
    text: "J'avais du mal à vérifier mon WhatsApp Business sans exposer mon numéro personnel. Simix m'a fourni un numéro valide en secondes, payé avec Wave. Service irréprochable, je recommande à toutes les entrepreneuses africaines.",
    stars: 5,
    service: "WhatsApp Business",
    date: "Avril 2026",
  },
  {
    name: "Chukwuemeka Obi",
    role: "Trader crypto",
    city: "Lagos, Nigeria",
    flag: "ng",
    initials: "CO",
    color: "#F59E0B",
    avatar: "/man-1.jpg",
    text: "Pour vérifier Binance et Coinbase, Simix est tout simplement parfait. Numéro livré en temps record, SMS reçu aussitôt. Prix très raisonnable en FCFA. Je l'utilise chaque semaine depuis 4 mois, jamais eu le moindre problème.",
    stars: 5,
    service: "Binance & Coinbase",
    date: "Février 2026",
  },
  {
    name: "Fatou Coulibaly",
    role: "Designer freelance",
    city: "Abidjan, Côte d'Ivoire",
    flag: "ci",
    initials: "FC",
    color: "#10B981",
    avatar: "/woman-2.jpg",
    text: "Je crée des comptes TikTok et Instagram pour mes clients. Grâce à Simix, plus aucun souci de vérification. Orange Money marche parfaitement. Les codes arrivent en moins d'une minute — c'est bluffant de rapidité.",
    stars: 5,
    service: "TikTok & Instagram",
    date: "Janvier 2026",
  },
  {
    name: "Jean-Pierre Mbeki",
    role: "Étudiant en informatique",
    city: "Douala, Cameroun",
    flag: "cm",
    initials: "JM",
    color: "#3B82F6",
    avatar: "/man-2.jpg",
    text: "J'utilisais des VPN coûteux pour accéder à Discord et Steam. Avec Simix, problème résolu en 2 minutes, paiement MTN. Le support répond très rapidement. Vraiment indispensable pour tous les gamers et étudiants africains.",
    stars: 5,
    service: "Discord & Steam",
    date: "Mars 2026",
  },
  {
    name: "Grace Achieng",
    role: "Comptable certifiée",
    city: "Nairobi, Kenya",
    flag: "ke",
    initials: "GA",
    color: "#8B5CF6",
    avatar: "/woman-3.jpg",
    text: "J'avais besoin de vérifier mon compte Google pour Google Workspace. Simix m'a fourni un numéro kenyan valide, payé via M-Pesa. Simple, rapide et 100% sécurisé. J'ai recommandé le service à toute mon équipe comptable.",
    stars: 5,
    service: "Google Workspace",
    date: "Avril 2026",
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

  if (!service.slug || !service.icon3d) {
    return (
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg" style={{ background: "linear-gradient(135deg,#7C3AED,#6366F1)" }}>
        <span className="text-2xl">+</span>
      </div>
    );
  }

  if (service.icon3d && !err) {
    return (
      <div className="w-14 h-14 flex items-center justify-center drop-shadow-xl">
        <img
          src={service.icon3d}
          alt={service.name}
          onError={() => setErr(true)}
          className="w-14 h-14 object-contain group-hover:scale-110 transition-transform duration-300"
        />
      </div>
    );
  }

  return (
    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl" style={{ background: service.color }}>
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
      <div className="px-4 sm:px-8 lg:px-16 xl:px-24 flex items-center justify-between gap-3">
        <SimixLogo size={28} />
        <div className="hidden lg:flex items-center gap-5 text-sm text-zinc-400">
          <a href="#comment" className="hover:text-white transition-colors whitespace-nowrap">Comment ça marche</a>
          <a href="#operateurs" className="hover:text-white transition-colors whitespace-nowrap">Opérateurs</a>
          <a href="#services" className="hover:text-white transition-colors whitespace-nowrap">Services</a>
          <a href="#securite" className="hover:text-white transition-colors whitespace-nowrap">Sécurité</a>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLocation("/login")} className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-zinc-300 hover:text-white transition-colors whitespace-nowrap">
            Se connecter
          </button>
          <button onClick={() => setLocation("/register")} className="px-3 sm:px-5 py-2 text-xs sm:text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors shadow-lg shadow-violet-600/20 whitespace-nowrap">
            <span className="hidden sm:inline">Commencer gratuitement</span>
            <span className="sm:hidden">Commencer</span>
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
                { value: "54", label: "Pays africains", icon: "/3d/step-globe.png" },
                { value: "11+", label: "Opérateurs MoMo", icon: "/3d/step-phone.png" },
                { value: "500+", label: "Services supportés", icon: "/3d/icon-check.png" },
              ].map((s, i) => (
                <div key={i} className="text-center p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 transition-colors">
                  <div className="flex justify-center mb-1.5">
                    <img src={s.icon} alt={s.label} className="w-8 h-8 object-contain drop-shadow-lg" />
                  </div>
                  <div className="text-xl font-bold text-white">{s.value}</div>
                  <div className="text-[11px] text-zinc-400 leading-tight mt-0.5">{s.label}</div>
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
                  <img src="/3d/icon-lightning.png" alt="" className="w-4 h-4 object-contain" />
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
    <div ref={ref} className="flex flex-col items-center py-5 gap-1.5 text-center px-2">
      {icon}
      <div className="text-xl font-extrabold text-white tabular-nums">{count}{suffix}</div>
      <div className="text-xs text-zinc-400 leading-tight">{label}</div>
    </div>
  );
}

/* ─── Stats bar ─── */
function StatsBar() {
  return (
    <div className="border-y border-zinc-800/60 bg-zinc-950/80">
      <Section>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-zinc-800/40">
          {[
            { el: <AnimatedStat target={54} icon={<img src="/3d/step-globe.png" alt="pays" className="w-8 h-8 object-contain drop-shadow-md" />} label="Pays africains couverts" /> },
            { el: <AnimatedStat target={11} suffix="+" icon={<img src="/3d/step-phone.png" alt="opérateurs" className="w-8 h-8 object-contain drop-shadow-md" />} label="Opérateurs Mobile Money" /> },
            { el: <AnimatedStat target={500} suffix="+" icon={<img src="/3d/services/whatsapp.png" alt="services" className="w-8 h-8 object-contain drop-shadow-md" />} label="Services vérifiables" /> },
            { el: (
              <div className="flex flex-col items-center py-5 gap-1.5 text-center px-2">
                <img src="/3d/icon-lightning.png" alt="rapide" className="w-8 h-8 object-contain drop-shadow-md" />
                <div className="text-xl font-extrabold text-white">&lt; 30s</div>
                <div className="text-xs text-zinc-400 leading-tight">Réception du SMS</div>
              </div>
            )},
            { el: <AnimatedStat target={100} suffix="%" icon={<img src="/3d/icon-shield.png" alt="sécurité" className="w-8 h-8 object-contain drop-shadow-md" />} label="Paiement Mobile Money" /> },
            { el: (
              <div className="flex flex-col items-center py-5 gap-1.5 text-center px-2">
                <img src="/3d/icon-lock.png" alt="ssl" className="w-8 h-8 object-contain drop-shadow-md" />
                <div className="text-xl font-extrabold text-white">SSL</div>
                <div className="text-xs text-zinc-400 leading-tight">Connexion sécurisée</div>
              </div>
            )},
          ].map((item, i) => (
            <div key={i} className="bg-zinc-950">{item.el}</div>
          ))}
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
          <p className="text-zinc-400 text-sm">
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
                { icon: "/3d/step-phone.png", text: "Interface mobile-first, compatible tous smartphones" },
                { icon: "/3d/icon-lightning.png", text: "Optimisé pour les réseaux 3G et 4G africains" },
                { icon: "/3d/step-globe.png", text: "Disponible en français et anglais, couvrant 54 pays africains" },
                { icon: "/3d/icon-check.png", text: "Adapté aux usages quotidiens des Africains connectés" },
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-9 h-9 flex-shrink-0 mt-0.5">
                    <img src={item.icon} alt="" className="w-full h-full object-contain drop-shadow-md" />
                  </div>
                  <span className="text-zinc-300 text-sm mt-2">{item.text}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex justify-center gap-3 sm:gap-4 items-end"
          >
            <div className="float-slow flex-1 max-w-[110px] sm:max-w-[140px] lg:max-w-[155px]">
              <div className="rounded-2xl overflow-hidden border border-zinc-700/40 shadow-2xl shadow-violet-900/20">
                <img src={screenDash} alt="Dashboard Simix" className="w-full" />
              </div>
            </div>
            <div className="float-fast flex-1 max-w-[110px] sm:max-w-[140px] lg:max-w-[155px] mb-6 sm:mb-8" style={{ animationDelay: "0.5s" }}>
              <div className="rounded-2xl overflow-hidden border border-zinc-700/40 shadow-2xl shadow-purple-900/20">
                <img src={screenWallet} alt="Wallet Simix" className="w-full" />
              </div>
            </div>
            <div className="float-slow flex-1 max-w-[110px] sm:max-w-[140px] lg:max-w-[155px]" style={{ animationDelay: "1s" }}>
              <div className="rounded-2xl overflow-hidden border border-zinc-700/40 shadow-2xl shadow-pink-900/20">
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
            <p className="text-zinc-300 text-sm sm:text-base leading-relaxed mb-4">
              Le Mobile Money est le principal outil financier de centaines de millions d'Africains.
              Pourtant, la plupart des plateformes numériques exigent une vérification SMS difficile à accomplir sans numéro adapté.
            </p>
            <p className="text-zinc-300 text-sm sm:text-base leading-relaxed mb-6">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {SERVICES.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.03, duration: 0.4 }}
            className="service-card group relative flex flex-col items-center gap-3 p-4 sm:p-5 rounded-2xl border border-zinc-800/50 bg-gradient-to-b from-zinc-900/80 to-zinc-900/50 cursor-default overflow-hidden hover:border-zinc-600/60 hover:from-zinc-800/80 hover:to-zinc-900/60 transition-all duration-300 shadow-lg shadow-black/20"
            style={{ borderTopColor: `${s.color}45` }}
          >
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{ background: `radial-gradient(ellipse at top, ${s.color}12, transparent 70%)` }}
            />
            <div className="relative z-10 flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
              <LandingServiceIcon service={s} />
            </div>
            <span className="text-[11px] sm:text-xs font-semibold text-center leading-tight relative z-10 text-zinc-300 group-hover:text-white transition-colors w-full">{s.name}</span>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-80 transition-opacity" style={{ backgroundColor: s.color }} />
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
                <div className="text-xs text-zinc-400 leading-relaxed">{f.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ─── Testimonials ─── */
function TestimonialAvatar({ t }: { t: typeof TESTIMONIALS[0] }) {
  const [err, setErr] = useState(false);
  if (!err) {
    return (
      <div className="relative flex-shrink-0">
        <div
          className="w-14 h-14 rounded-full p-0.5 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}55)` }}
        >
          <img
            src={t.avatar}
            alt={t.name}
            onError={() => setErr(true)}
            className="w-full h-full rounded-full object-cover object-top"
          />
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-zinc-900 flex items-center justify-center">
          <CheckCircle className="w-2.5 h-2.5 text-white" />
        </div>
      </div>
    );
  }
  return (
    <div className="relative flex-shrink-0">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-lg"
        style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}88)` }}
      >
        {t.initials}
      </div>
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-zinc-900 flex items-center justify-center">
        <CheckCircle className="w-2.5 h-2.5 text-white" />
      </div>
    </div>
  );
}

function Testimonials() {
  return (
    <Section className="py-20" id="avis">
      <div className="text-center mb-12">
        <SectionPill label="Avis clients vérifiés" color="emerald" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
          Ce qu'ils disent de{" "}
          <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">Simix</span>
        </h2>
        <p className="text-zinc-400 text-base max-w-2xl mx-auto leading-relaxed">
          Plus de 5 000 Africains utilisent Simix chaque jour pour accéder aux services numériques du monde entier — payés en Mobile Money local.
        </p>
        {/* Overall rating bar */}
        <div className="inline-flex items-center gap-3 mt-5 px-5 py-2.5 rounded-full bg-zinc-900/80 border border-zinc-800/60">
          <div className="flex text-amber-400 text-sm gap-0.5">{"★".repeat(5)}</div>
          <span className="text-white font-bold text-sm">4.9/5</span>
          <span className="text-zinc-500 text-xs">sur 1 247 avis</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {TESTIMONIALS.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
            className="group relative flex flex-col rounded-2xl overflow-hidden border border-zinc-800/60 bg-zinc-900/50 hover:bg-zinc-900/80 hover:border-zinc-700/80 transition-all duration-300"
            style={{ boxShadow: "0 0 0 0 transparent" }}
          >
            {/* Top accent bar */}
            <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${t.color}99, ${t.color}22)` }} />

            <div className="flex flex-col gap-4 p-6 flex-1">
              {/* Header: stars + service badge + date */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex text-amber-400 text-base gap-0.5 leading-none">
                  {"★".repeat(t.stars)}
                </div>
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0"
                  style={{ background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}33` }}
                >
                  {t.service}
                </span>
              </div>

              {/* Quote mark + text */}
              <div className="relative">
                <div
                  className="absolute -top-1 -left-0.5 text-5xl font-serif leading-none select-none"
                  style={{ color: `${t.color}30` }}
                >
                  "
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed pt-4 relative z-10">
                  {t.text}
                </p>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Footer: avatar + name + role + date */}
              <div className="flex items-center gap-3 pt-4 border-t border-zinc-800/50">
                <TestimonialAvatar t={t} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-white truncate">{t.name}</span>
                    <FlagImg code={t.flag} size={16} />
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">{t.role} · {t.city}</div>
                </div>
                <div className="text-xs text-zinc-600 flex-shrink-0 hidden sm:block">{t.date}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Trust bar */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-5 sm:gap-8">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <img src="/3d/icon-check.png" alt="" className="w-5 h-5 object-contain drop-shadow-sm" />
          <span>5 000+ utilisateurs actifs</span>
        </div>
        <div className="w-px h-4 bg-zinc-700 hidden sm:block" />
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <img src="/3d/icon-shield.png" alt="" className="w-5 h-5 object-contain drop-shadow-sm" />
          <span>Avis clients authentiques</span>
        </div>
        <div className="w-px h-4 bg-zinc-700 hidden sm:block" />
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <img src="/3d/icon-lightning.png" alt="" className="w-5 h-5 object-contain drop-shadow-sm" />
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
          <p className="text-zinc-300 text-base max-w-xl mx-auto mb-8 leading-relaxed">
            Inscription gratuite. Aucune carte bancaire.
            Payez uniquement avec votre Mobile Money local.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => setLocation("/register")}
              className="flex items-center gap-2 px-6 sm:px-8 py-3.5 sm:py-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all shadow-2xl shadow-violet-600/30 text-sm sm:text-base"
            >
              Créer mon compte gratuit <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLocation("/login")}
              className="flex items-center gap-2 px-6 sm:px-8 py-3.5 sm:py-4 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold rounded-xl transition-all text-sm sm:text-base"
            >
              J'ai déjà un compte
            </button>
          </div>
          <p className="text-zinc-500 text-xs mt-5 flex items-center justify-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
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
            <p className="text-zinc-400 text-sm mt-3 leading-relaxed max-w-xs">
              La plateforme de numéros virtuels SMS pensée pour les Africains. Paiements 100% Mobile Money.
            </p>
            <div className="flex gap-2 mt-4 flex-wrap">
              {["ci","sn","cm","gh","ng","ke"].map(code => (
                <FlagImg key={code} code={code} size={28} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-300 uppercase tracking-widest mb-3">Produit</div>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><button onClick={() => setLocation("/register")} className="hover:text-white transition-colors">S'inscrire</button></li>
              <li><button onClick={() => setLocation("/login")} className="hover:text-white transition-colors">Se connecter</button></li>
              <li><a href="#services" className="hover:text-white transition-colors">Services</a></li>
              <li><a href="#operateurs" className="hover:text-white transition-colors">Opérateurs</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-300 uppercase tracking-widest mb-3">Ressources</div>
            <ul className="space-y-2 text-sm text-zinc-400">
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
          <p className="text-xs text-zinc-500">© 2026 Simix. Tous droits réservés.</p>
          <div className="flex gap-4 text-xs text-zinc-500">
            <span className="hover:text-zinc-300 cursor-pointer transition-colors">Confidentialité</span>
            <span className="hover:text-zinc-300 cursor-pointer transition-colors">CGU</span>
            <span className="hover:text-zinc-300 cursor-pointer transition-colors">Mentions légales</span>
          </div>
          <p className="text-xs text-zinc-500">Conçu pour l'Afrique</p>
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
