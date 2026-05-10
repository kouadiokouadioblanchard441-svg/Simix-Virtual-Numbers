import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronRight, HelpCircle, BookOpen, Star, FileText, Phone, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useContactSettings } from "@/hooks/use-contact-settings";

function WhatsAppLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M24 4C13.0 4 4 13.0 4 24c0 3.56.96 6.9 2.64 9.76L4 44l10.56-2.6A19.9 19.9 0 0024 44c11.0 0 20-9.0 20-20S35.0 4 24 4z" fill="#25D366"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M19.2 15.6c-.4-1-.8-1-.12-1h-.88c-.28 0-.76.1-1.16.52-.4.4-1.52 1.48-1.52 3.6s1.56 4.18 1.78 4.48c.2.28 3.04 4.8 7.46 6.52 1.04.4 1.84.64 2.48.82.04.02 1.04.28 2 .18.96-.1 2.02-.6 2.26-1.16.24-.56.24-1.04.16-1.14-.08-.1-.28-.16-.56-.3-.28-.14-1.64-.8-1.9-.9-.26-.1-.44-.14-.62.14-.18.28-.7.9-.86 1.08-.16.18-.32.2-.6.08-.28-.14-1.18-.44-2.24-1.38-.82-.72-1.38-1.62-1.54-1.9-.16-.28-.02-.42.12-.56.12-.12.28-.32.42-.48.14-.16.18-.28.28-.46.1-.18.04-.34-.02-.48-.08-.14-.62-1.52-.86-2.08-.24-.56-.48-.48-.62-.48h-.54z" fill="white"/>
    </svg>
  );
}

function EmailLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="10" fill="white" fillOpacity="0"/>
      <path d="M6 12L24 27L42 12" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 12h36v26a2 2 0 01-2 2H8a2 2 0 01-2-2V12z" stroke="#4285F4" strokeWidth="3" strokeLinejoin="round" fill="none"/>
      <path d="M6 38l13-14M42 38L29 24" stroke="#4285F4" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

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
  const { supportEmail, supportPhone, supportWhatsapp } = useContactSettings();

  const whatsappNumber = supportWhatsapp || "+2250101234567";
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20Simix.`;

  const handleWhatsApp = () => {
    window.open(whatsappUrl, "_blank");
  };

  const handleEmail = () => {
    window.open(`mailto:${supportEmail}?subject=Demande%20d%27assistance%20Simix`, "_blank");
  };

  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  const handleSubmitRating = async () => {
    if (!rating) return;
    setSubmittingRating(true);
    try {
      await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ score: rating }),
      });
    } catch { /* ignore */ }
    setSubmittingRating(false);
    setRatingSubmitted(true);
    toast({ title: "Merci pour votre avis !", description: `Vous avez noté l'app ${rating}/5 étoiles.` });
  };

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
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
          <button onClick={handleWhatsApp} className="flex flex-col items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl hover:bg-emerald-500/20 transition-colors active:scale-95">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center drop-shadow-md">
              <WhatsAppLogo size={44} />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-emerald-400">WhatsApp</p>
              <p className="text-[10px] text-muted-foreground">Réponse en ~15 min</p>
            </div>
          </button>
          <button onClick={handleEmail} className="flex flex-col items-center gap-2 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl hover:bg-blue-500/20 transition-colors active:scale-95">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center drop-shadow-md">
              <EmailLogo size={44} />
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
            <button onClick={() => setLocation("/profile/aide/centre")} className="w-full flex items-center justify-between py-3 px-2 rounded-xl hover:bg-secondary/50 transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Centre d'aide en ligne</p>
                  <p className="text-xs text-muted-foreground">Guides et tutoriels détaillés</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={() => window.open(`mailto:${supportEmail}?subject=Bug%20Simix`, "_blank")} className="w-full flex items-center justify-between py-3 px-2 rounded-xl hover:bg-secondary/50 transition-colors text-left">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                  <FileText className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Signaler un bug</p>
                  <p className="text-xs text-muted-foreground">Aidez-nous à améliorer l'application</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            {supportPhone && (
              <button onClick={() => window.open(`tel:${supportPhone}`, "_blank")} className="w-full flex items-center justify-between py-3 px-2 rounded-xl hover:bg-secondary/50 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                    <Phone className="w-4 h-4 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Nous appeler</p>
                    <p className="text-xs text-muted-foreground">{supportPhone}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Rate the app */}
        <div className="bg-card border border-card-border rounded-3xl p-5 text-center">
          <Star className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-foreground mb-1">Vous aimez Simix ?</h3>
          <p className="text-xs text-muted-foreground mb-4">Votre avis nous aide à nous améliorer</p>
          {ratingSubmitted ? (
            <div className="py-2">
              <p className="text-sm font-bold text-emerald-400">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</p>
              <p className="text-xs text-emerald-400 mt-2 font-medium">✓ Merci pour votre note de {rating}/5 !</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="text-3xl transition-transform hover:scale-110"
                  >
                    <span className={(hoverRating || rating) >= star ? "text-emerald-400" : "text-muted-foreground/30"}>★</span>
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <button
                  onClick={handleSubmitRating}
                  disabled={submittingRating}
                  className="flex items-center justify-center gap-2 mx-auto px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  {submittingRating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submittingRating ? "Envoi…" : "Envoyer mon avis"}
                </button>
              )}
              {!rating && <p className="text-xs text-muted-foreground/60">Cliquez sur une étoile pour noter</p>}
            </>
          )}
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
