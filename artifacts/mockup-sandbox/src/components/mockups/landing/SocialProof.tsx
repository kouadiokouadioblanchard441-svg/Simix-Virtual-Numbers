import { ArrowRight, Star, Users, MessageSquare, Globe, TrendingUp, CheckCircle, ChevronRight, Smartphone } from "lucide-react";

const TESTIMONIALS = [
  { name: "Kofi A.", country: "🇨🇮 Abidjan", text: "J'ai pu vérifier mon compte WhatsApp Business en moins de 2 minutes. Paiement via Orange Money, c'est parfait !", stars: 5 },
  { name: "Mamadou D.", country: "🇸🇳 Dakar", text: "Simix m'a sauvé pour créer mon compte Binance. Le numéro US a fonctionné du premier coup.", stars: 5 },
  { name: "Amina T.", country: "🇲🇱 Bamako", text: "Très simple à utiliser. J'ai rechargé via MTN et reçu mon SMS Google en 30 secondes.", stars: 5 },
];

const STEPS = [
  { n: "01", title: "Choisissez un service", desc: "WhatsApp, Telegram, Google, TikTok… + 500 options" },
  { n: "02", title: "Sélectionnez un pays", desc: "USA, UK, France, CI, SN, ML et 15 autres pays" },
  { n: "03", title: "Payez en FCFA", desc: "Orange Money, MTN, Wave ou carte bancaire" },
  { n: "04", title: "Recevez votre SMS", desc: "Le code arrive en moins de 60 secondes" },
];

const SERVICES_ROW = ["WhatsApp", "Telegram", "Google", "Facebook", "TikTok", "Instagram", "Twitter / X", "Discord", "Snapchat", "Apple", "Microsoft", "Signal"];

export function SocialProof() {
  return (
    <div className="min-h-screen bg-[#080810] text-white overflow-x-hidden font-['Inter']">

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg">Simix</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-sm text-white/60 hover:text-white px-4 py-2 transition-colors">Connexion</button>
          <button className="text-sm bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg transition-colors font-medium">
            Créer un compte
          </button>
        </div>
      </nav>

      {/* Trust bar */}
      <div className="bg-violet-950/40 border-y border-violet-800/30 py-3 px-8">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-white/70">
            <Users className="w-4 h-4 text-violet-400" />
            <span><strong className="text-white">50 000+</strong> utilisateurs actifs</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2 text-white/70">
            <MessageSquare className="w-4 h-4 text-violet-400" />
            <span><strong className="text-white">500 000+</strong> SMS délivrés</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2 text-white/70">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <span>Note <strong className="text-white">4.9/5</strong> sur 12 000 avis</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2 text-white/70">
            <Globe className="w-4 h-4 text-violet-400" />
            <span><strong className="text-white">20</strong> pays disponibles</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-8 pt-20 pb-16 text-center relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-violet-700/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 text-xs text-violet-300 bg-violet-600/10 border border-violet-500/20 rounded-full px-4 py-2 mb-6">
            <TrendingUp className="w-3 h-3" />
            La solution #1 en Afrique de l'Ouest
          </div>

          <h1 className="text-5xl font-black leading-tight mb-5 tracking-tight">
            Recevez vos SMS de<br />
            <span className="text-violet-400">vérification</span> en toute confiance
          </h1>

          <p className="text-xl text-white/55 mb-8 max-w-2xl mx-auto leading-relaxed">
            Des milliers d'utilisateurs en Côte d'Ivoire, au Sénégal, au Mali et partout en Afrique font confiance à Simix pour vérifier leurs comptes en ligne. Payez en FCFA.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-10">
            <button className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 px-8 py-4 rounded-xl font-semibold text-base transition-all">
              Commencer maintenant — c'est gratuit
              <ArrowRight className="w-4 h-4" />
            </button>
            <button className="flex items-center justify-center gap-2 border border-white/10 hover:border-white/20 px-6 py-4 rounded-xl text-white/60 hover:text-white text-sm transition-all">
              Voir comment ça marche
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Stars */}
          <div className="flex justify-center items-center gap-2">
            {[1,2,3,4,5].map(i => <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />)}
            <span className="text-white/50 text-sm ml-1">Noté 4.9/5 par nos utilisateurs</span>
          </div>
        </div>
      </div>

      {/* Services scroll */}
      <div className="border-y border-white/5 py-6 overflow-hidden">
        <div className="flex gap-6 px-8 flex-wrap justify-center">
          {SERVICES_ROW.map(s => (
            <div key={s} className="flex items-center gap-2 text-white/40 text-sm whitespace-nowrap">
              <CheckCircle className="w-3.5 h-3.5 text-violet-500" />
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-5xl mx-auto px-8 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">Simple comme bonjour</h2>
          <p className="text-white/45">4 étapes pour recevoir votre code SMS en moins de 2 minutes</p>
        </div>
        <div className="grid md:grid-cols-4 gap-4 relative">
          {/* Connector line */}
          <div className="absolute top-8 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-violet-600/0 via-violet-600/40 to-violet-600/0 hidden md:block" />
          {STEPS.map(step => (
            <div key={step.n} className="relative text-center">
              <div className="w-14 h-14 bg-violet-600/20 border-2 border-violet-600/40 rounded-2xl flex items-center justify-center mx-auto mb-4 text-violet-400 font-black text-sm relative z-10">
                {step.n}
              </div>
              <h3 className="font-semibold mb-1 text-sm">{step.title}</h3>
              <p className="text-xs text-white/45 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <div className="bg-white/[0.02] border-y border-white/5 py-16 px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">Ils nous font confiance</h2>
            <p className="text-white/40 text-sm">Des utilisateurs réels, des résultats concrets</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="bg-[#0F0F1C] border border-white/8 rounded-2xl p-6">
                <div className="flex gap-1 mb-3">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />)}
                </div>
                <p className="text-white/70 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-purple-700 rounded-full flex items-center justify-center text-xs font-bold">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-white/40">{t.country}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA + Payment */}
      <div className="max-w-3xl mx-auto px-8 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Prêt à commencer ?</h2>
        <p className="text-white/50 mb-8">Rejoignez 50 000 utilisateurs qui font confiance à Simix. Pas d'abonnement, payez uniquement ce que vous utilisez.</p>
        <button className="bg-violet-600 hover:bg-violet-500 px-10 py-4 rounded-xl font-semibold text-lg transition-all mb-8 flex items-center gap-2 mx-auto">
          Obtenir mon premier numéro
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex flex-wrap justify-center gap-3">
          {["🟠 Orange Money", "🟡 MTN Money", "🔵 Wave", "💳 Carte bancaire"].map(p => (
            <span key={p} className="text-xs text-white/40 bg-white/5 border border-white/8 rounded-lg px-3 py-2">{p}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
