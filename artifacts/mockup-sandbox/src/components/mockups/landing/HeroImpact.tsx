import { ArrowRight, Smartphone, Shield, Zap, Globe, MessageSquare, CheckCircle, Star, ChevronRight } from "lucide-react";

const SERVICES = [
  { name: "WhatsApp", color: "#25D366", icon: "💬" },
  { name: "Telegram", color: "#2AABEE", icon: "✈️" },
  { name: "Google", color: "#EA4335", icon: "🔍" },
  { name: "Facebook", color: "#1877F2", icon: "📘" },
  { name: "TikTok", color: "#FF0050", icon: "🎵" },
  { name: "Instagram", color: "#E1306C", icon: "📸" },
];

const STATS = [
  { value: "54", label: "Pays africains" },
  { value: "500+", label: "Services supportés" },
  { value: "50k+", label: "Utilisateurs actifs" },
  { value: "99.9%", label: "Disponibilité" },
];

const FEATURES = [
  { icon: Zap, title: "Instantané", desc: "Recevez votre SMS en moins de 60 secondes" },
  { icon: Shield, title: "Anonyme & sécurisé", desc: "Aucune donnée personnelle requise pour créer un compte" },
  { icon: Globe, title: "20+ pays", desc: "USA, UK, France, Côte d'Ivoire, Sénégal et plus" },
  { icon: MessageSquare, title: "Multi-SMS", desc: "Un numéro peut recevoir plusieurs codes successifs" },
];

export function HeroImpact() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white overflow-x-hidden font-['Inter']">

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Simix</span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-white/60">
          <a href="#" className="hover:text-white transition-colors">Services</a>
          <a href="#" className="hover:text-white transition-colors">Pays</a>
          <a href="#" className="hover:text-white transition-colors">Tarifs</a>
          <a href="#" className="hover:text-white transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-sm text-white/70 hover:text-white px-4 py-2 transition-colors">Connexion</button>
          <button className="text-sm bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg transition-colors font-medium">
            Commencer
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative px-8 pt-20 pb-16 max-w-7xl mx-auto">
        {/* Glow background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="grid lg:grid-cols-2 gap-16 items-center relative z-10">
          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 bg-violet-600/10 border border-violet-500/20 rounded-full px-4 py-2 text-sm text-violet-300 mb-6">
              <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
              Numéros disponibles maintenant
            </div>

            <h1 className="text-5xl lg:text-6xl font-black leading-[1.05] mb-6 tracking-tight">
              Vérifiez<br />
              n'importe quel<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-300">
                service en ligne
              </span>
            </h1>

            <p className="text-lg text-white/60 mb-8 leading-relaxed max-w-md">
              Obtenez un numéro de téléphone virtuel temporaire et recevez vos codes SMS de vérification. Payez en <strong className="text-white/80">FCFA</strong> via Orange Money, MTN ou Wave.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <button className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 px-6 py-4 rounded-xl font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98]">
                Obtenir un numéro
                <ArrowRight className="w-4 h-4" />
              </button>
              <button className="flex items-center justify-center gap-2 border border-white/10 hover:border-white/20 px-6 py-4 rounded-xl font-medium text-base transition-all text-white/70 hover:text-white">
                Voir les tarifs
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Social proof */}
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 border-2 border-[#0A0A0F]" />
                ))}
              </div>
              <div className="flex items-center gap-1 text-sm text-white/60">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <strong className="text-white">4.9/5</strong> · 12 000+ avis
              </div>
            </div>
          </div>

          {/* Right — Phone mockup */}
          <div className="relative flex justify-center">
            <div className="relative w-[300px]">
              {/* Phone frame */}
              <div className="relative bg-[#131320] border border-white/10 rounded-[40px] p-4 shadow-2xl shadow-violet-900/30">
                <div className="bg-[#0D0D1A] rounded-[32px] overflow-hidden" style={{ minHeight: 500 }}>
                  {/* Status bar */}
                  <div className="flex justify-between items-center px-5 pt-3 pb-2 text-xs text-white/50">
                    <span>9:41</span>
                    <div className="flex gap-1">
                      <span>●●●</span>
                    </div>
                  </div>

                  {/* App header */}
                  <div className="flex items-center gap-2 px-5 pb-4">
                    <div className="w-6 h-6 bg-violet-600 rounded-lg flex items-center justify-center">
                      <Smartphone className="w-3 h-3 text-white" />
                    </div>
                    <span className="font-bold text-sm">Simix</span>
                    <span className="ml-auto text-xs text-violet-400 font-semibold">12 450 FCFA</span>
                  </div>

                  {/* Number card */}
                  <div className="mx-3 bg-gradient-to-br from-violet-600/30 to-purple-900/20 border border-violet-500/30 rounded-2xl p-4 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <img src="https://flagcdn.com/w20/us.png" className="w-5 h-3 object-cover rounded" alt="US" />
                      <span className="text-xs text-white/60">États-Unis</span>
                      <span className="ml-auto text-xs bg-violet-600/40 text-violet-300 px-2 py-0.5 rounded-full">WhatsApp</span>
                    </div>
                    <div className="text-xl font-mono font-bold tracking-wider text-white mb-1">+1 (415) 555-0192</div>
                    <div className="flex items-center gap-1 text-xs text-green-400">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      En attente d'un SMS…
                    </div>
                  </div>

                  {/* SMS received */}
                  <div className="mx-3 bg-[#1A1A2E] rounded-2xl p-4 mb-3">
                    <div className="text-xs text-white/40 mb-2">SMS reçu · il y a 12s</div>
                    <div className="text-sm text-white/90 leading-relaxed">
                      Your WhatsApp code is <strong className="text-violet-300">842-619</strong>. Do not share this code.
                    </div>
                  </div>

                  {/* Services list */}
                  <div className="px-3 pb-4">
                    <div className="text-xs text-white/40 mb-2 px-1">Choisissez un service</div>
                    <div className="grid grid-cols-3 gap-2">
                      {SERVICES.slice(0,6).map(s => (
                        <div key={s.name} className="bg-white/5 rounded-xl p-2 flex flex-col items-center gap-1">
                          <span className="text-lg">{s.icon}</span>
                          <span className="text-[9px] text-white/50">{s.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating badges */}
              <div className="absolute -left-8 top-16 bg-[#1A1A2E] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-white/80">SMS reçu !</span>
                </div>
              </div>
              <div className="absolute -right-10 top-40 bg-[#1A1A2E] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
                <div className="flex items-center gap-2">
                  <span>🇨🇮</span>
                  <span className="text-white/80">Orange Money</span>
                </div>
              </div>
              <div className="absolute -left-10 bottom-24 bg-violet-600/20 border border-violet-500/30 rounded-xl px-3 py-2 text-xs shadow-xl">
                <div className="text-violet-300 font-semibold">150 FCFA</div>
                <div className="text-white/50">WhatsApp / US</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="border-y border-white/5 bg-white/[0.02] py-8">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 px-8">
          {STATS.map(s => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-black text-violet-400 mb-1">{s.value}</div>
              <div className="text-sm text-white/50">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="max-w-6xl mx-auto px-8 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Pourquoi choisir Simix ?</h2>
          <p className="text-white/50">La solution la plus simple pour recevoir des SMS de vérification en Afrique.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 hover:border-violet-500/30 transition-colors group">
              <div className="w-10 h-10 bg-violet-600/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-violet-600/30 transition-colors">
                <f.icon className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Payment methods */}
      <div className="border-t border-white/5 py-10 px-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm text-white/30 mb-5">Paiements acceptés</p>
          <div className="flex flex-wrap justify-center gap-4">
            {["🟠 Orange Money", "🟡 MTN Money", "🔵 Wave", "💳 Carte bancaire", "🟢 Moov Money"].map(p => (
              <div key={p} className="bg-white/5 border border-white/8 rounded-lg px-4 py-2 text-sm text-white/60">
                {p}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
