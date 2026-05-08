import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronRight, MessageCircle, Mail, HelpCircle, ExternalLink, Star, FileText, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FAQ = [
  {
    q: "Comment recharger mon solde ?",
    a: "Allez dans l'onglet Solde, puis cliquez sur '+ Recharger'. Choisissez votre opérateur (Orange Money, MTN, Wave...), entrez le montant et suivez les instructions. Le rechargement est instantané.",
  },
  {
    q: "Que faire si je ne reçois pas le SMS ?",
    a: "Attendez 2-3 minutes. Si le SMS n'arrive pas, le numéro est éligible à un remboursement automatique. Rendez-vous dans vos numéros actifs et cliquez sur 'Annuler' pour récupérer votre solde.",
  },
  {
    q: "Combien de temps dure un numéro virtuel ?",
    a: "Par défaut, les numéros restent actifs 15 minutes — largement suffisant pour recevoir un SMS. Vous pouvez prolonger de 5 minutes supplémentaires pour 30 FCFA si nécessaire.",
  },
  {
    q: "Mon paiement est bloqué, que faire ?",
    a: "Vérifiez que vous avez suffisamment de crédit Mobile Money. Si le problème persiste, contactez notre support WhatsApp ou envoyez un email. Nous traitons chaque cas en moins de 2h.",
  },
  {
    q: "Peut-on utiliser Simix pour plusieurs services ?",
    a: "Oui ! Un numéro virtuel peut être utilisé pour un seul service à la fois. Pour vérifier plusieurs comptes différents, achetez autant de numéros que nécessaire.",
  },
  {
    q: "Comment fonctionne le remboursement ?",
    a: "Si aucun SMS n'est reçu dans les délais, votre solde est recrédité automatiquement. En cas de problème, contactez le support avec votre numéro de commande.",
  },
  {
    q: "Comment changer mon mot de passe ?",
    a: "Allez dans Profil → Sécurité → Changer le mot de passe. Entrez votre ancien mot de passe puis le nouveau. La modification est immédiate.",
  },
  {
    q: "Simix est-il sécurisé ?",
    a: "Oui. Toutes vos données sont chiffrées. Les numéros virtuels sont temporaires et détruits après usage. Vos informations bancaires ne sont jamais stockées sur nos serveurs.",
  },
];

export default function ProfileAide() {
  return (
    <AuthGuard>
      <AppLayout>
        <AideContent />
      </AppLayout>
    </AuthGuard>
  );
}

function AideContent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  const handleWhatsApp = () => {
    window.open("https://wa.me/2250101234567?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20Simix.", "_blank");
  };

  const handleEmail = () => {
    window.open("mailto:support@simix.app?subject=Demande%20d%27assistance%20Simix", "_blank");
  };

  const handleRating = (r: number) => {
    setRating(r);
    toast({ title: "Merci pour votre avis !", description: `Vous avez noté l'app ${r}/5 étoiles.` });
  };

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-6 pb-3 border-b border-card-border/50">
        <button onClick={() => setLocation("/profile")} className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Aide et support</h1>
        <div className="w-9 h-9" />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        {/* Contact rapide */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={handleWhatsApp} className="flex flex-col items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl hover:bg-emerald-500/20 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-emerald-400">WhatsApp</p>
              <p className="text-[10px] text-muted-foreground">Réponse en ~15 min</p>
            </div>
          </button>
          <button onClick={handleEmail} className="flex flex-col items-center gap-2 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl hover:bg-blue-500/20 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-blue-400">Email</p>
              <p className="text-[10px] text-muted-foreground">Réponse en 2h</p>
            </div>
          </button>
        </div>

        {/* Support hours */}
        <div className="flex items-center gap-3 p-4 bg-card border border-card-border rounded-2xl">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Support disponible</p>
            <p className="text-xs text-muted-foreground">Lun–Sam · 7h–22h (heure d'Afrique de l'Ouest)</p>
          </div>
        </div>

        {/* FAQ */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Questions fréquentes</h3>
          </div>
          <div className="space-y-2">
            {FAQ.map((item, i) => (
              <div key={i} className="border border-card-border/60 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-secondary/50 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground leading-snug">{item.q}</span>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${openFaq === i ? "rotate-90 text-primary" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4 text-xs text-muted-foreground leading-relaxed border-t border-card-border/40 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Liens utiles */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">Ressources</h3>
          <div className="space-y-1">
            {[
              { label: "Centre d'aide en ligne", sub: "Guides et tutoriels détaillés", icon: ExternalLink },
              { label: "Signaler un bug", sub: "Aidez-nous à améliorer l'application", icon: FileText },
              { label: "Nous appeler", sub: "+225 07 00 00 00 · Lun–Sam", icon: Phone },
            ].map(({ label, sub, icon: Icon }) => (
              <button key={label} className="w-full flex items-center justify-between py-3 px-2 rounded-xl hover:bg-secondary/50 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                    <Icon className="w-4 h-4 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>

        {/* Rate the app */}
        <div className="bg-card border border-card-border rounded-3xl p-5 text-center">
          <Star className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-foreground mb-1">Vous aimez Simix ?</h3>
          <p className="text-xs text-muted-foreground mb-4">Votre avis nous aide à nous améliorer</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="text-3xl transition-transform hover:scale-110"
              >
                <span className={(hoverRating || rating) >= star ? "text-amber-400" : "text-muted-foreground/30"}>★</span>
              </button>
            ))}
          </div>
          {rating > 0 && <p className="text-xs text-amber-400 mt-3 font-medium">Merci pour votre note de {rating}/5 !</p>}
        </div>

        {/* App info */}
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground/60">Simix v1.0.0 · Conçu pour l'Afrique</p>
          <p className="text-[10px] text-muted-foreground/40 mt-1">© 2026 Simix Technologies. Tous droits réservés.</p>
        </div>
      </motion.div>
    </div>
  );
}
