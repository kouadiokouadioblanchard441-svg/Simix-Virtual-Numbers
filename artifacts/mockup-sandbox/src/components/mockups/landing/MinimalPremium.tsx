import { ArrowUpRight, Smartphone, Zap, Lock, Globe2, ChevronRight } from "lucide-react";

const NUMBERS = [
  { flag: "🇺🇸", country: "États-Unis", service: "WhatsApp", price: "150", time: "~30s" },
  { flag: "🇫🇷", country: "France", service: "Telegram", price: "200", time: "~45s" },
  { flag: "🇬🇧", country: "Royaume-Uni", service: "Google", price: "180", time: "~40s" },
];

const PILLARS = [
  { icon: Zap, label: "Ultra-rapide", detail: "SMS en moins d'une minute" },
  { icon: Lock, label: "Privé", detail: "Aucune donnée stockée" },
  { icon: Globe2, label: "20 pays", detail: "USA, Europe, Afrique" },
];

export function MinimalPremium() {
  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Very minimal nav */}
      <nav className="flex items-center justify-between px-10 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <Smartphone className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-base tracking-tight">Simix</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs text-white/40 hover:text-white/70 px-4 py-2 transition-colors">Se connecter</button>
          <button className="text-xs bg-white text-black hover:bg-white/90 px-4 py-2.5 rounded-lg font-semibold transition-all">
            Commencer →
          </button>
        </div>
      </nav>

      {/* Hero — ultra clean */}
      <div className="max-w-4xl mx-auto px-10 pt-24 pb-20">

        {/* Tiny label */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-1.5 h-1.5 bg-violet-500 rounded-full" />
          <span className="text-xs text-white/35 tracking-widest uppercase font-medium">Numéros virtuels · SMS · Afrique</span>
        </div>

        {/* Giant heading */}
        <h1 className="text-[72px] font-black leading-[0.95] tracking-tight mb-8">
          <span className="text-white/15">Un</span>{" "}
          <span>numéro.</span>
          <br />
          <span className="text-transparent" style={{
            WebkitTextStroke: "1px rgba(139,92,246,0.6)"
          }}>Un code.</span>
          <br />
          <span>Vérifier.</span>
        </h1>

        <div className="max-w-lg">
          <p className="text-base text-white/40 leading-relaxed mb-10">
            Obtenez un numéro de téléphone temporaire dans 20 pays. Recevez votre SMS de vérification. Payez en FCFA via mobile money — sans abonnement, sans engagement.
          </p>

          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all group">
              Obtenir un numéro
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
            <button className="flex items-center gap-1.5 text-sm text-white/30 hover:text-white/60 transition-colors">
              Voir les pays
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Live numbers table */}
      <div className="max-w-4xl mx-auto px-10 pb-20">
        <div className="border border-white/6 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/[0.02]">
            <span className="text-xs text-white/30 font-medium tracking-wide uppercase">Numéros disponibles maintenant</span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-white/20">En ligne</span>
            </div>
          </div>
          {NUMBERS.map((n, i) => (
            <div key={n.country} className={`flex items-center gap-4 px-5 py-4 ${i < NUMBERS.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/[0.02] transition-colors cursor-pointer group`}>
              <span className="text-xl">{n.flag}</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-white/80">{n.country}</div>
                <div className="text-xs text-white/30">{n.service}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-violet-400">{n.price} FCFA</div>
                <div className="text-xs text-white/25">SMS en {n.time}</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-white/15 group-hover:text-white/40 transition-colors" />
            </div>
          ))}
          <div className="px-5 py-3 border-t border-white/5 bg-white/[0.01]">
            <button className="text-xs text-white/25 hover:text-violet-400 transition-colors flex items-center gap-1">
              Voir tous les 500+ services disponibles →
            </button>
          </div>
        </div>
      </div>

      {/* Pillars */}
      <div className="max-w-4xl mx-auto px-10 pb-20">
        <div className="grid grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden">
          {PILLARS.map((p, i) => (
            <div key={p.label} className="bg-[#050508] px-8 py-8 flex flex-col gap-3">
              <div className="w-8 h-8 rounded-lg border border-violet-600/30 flex items-center justify-center">
                <p.icon className="w-4 h-4 text-violet-500" />
              </div>
              <div>
                <div className="text-sm font-semibold mb-0.5">{p.label}</div>
                <div className="text-xs text-white/30">{p.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA — minimal */}
      <div className="max-w-4xl mx-auto px-10 pb-24">
        <div className="relative rounded-2xl overflow-hidden border border-violet-500/15">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/60 to-purple-950/20" />
          <div className="relative px-10 py-12 flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold mb-1">Commencez maintenant.</div>
              <div className="text-white/40 text-sm">Orange Money · MTN · Wave · Carte bancaire · FCFA</div>
            </div>
            <button className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap">
              Créer un compte gratuit
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer minimal */}
      <div className="border-t border-white/5 px-10 py-6 flex items-center justify-between">
        <span className="text-xs text-white/20">© 2026 Simix · Numéros virtuels pour l'Afrique</span>
        <div className="flex gap-4 text-xs text-white/20">
          <a href="#" className="hover:text-white/40 transition-colors">CGU</a>
          <a href="#" className="hover:text-white/40 transition-colors">Confidentialité</a>
          <a href="#" className="hover:text-white/40 transition-colors">Contact</a>
        </div>
      </div>
    </div>
  );
}
