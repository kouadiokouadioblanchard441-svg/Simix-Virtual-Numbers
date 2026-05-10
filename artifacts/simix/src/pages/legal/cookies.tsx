import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Cookie } from "lucide-react";
import { SimixLogo } from "@/components/simix-logo";
import { useContactSettings } from "@/hooks/use-contact-settings";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
        <span className="w-1 h-4 rounded-full bg-primary flex-shrink-0" />
        {title}
      </h2>
      <div className="text-xs text-muted-foreground leading-relaxed space-y-2 pl-3">{children}</div>
    </div>
  );
}

type CookieRow = { name: string; purpose: string; duration: string; essential: boolean };

const COOKIES: CookieRow[] = [
  { name: "simix_session", purpose: "Session utilisateur — maintien de la connexion", duration: "Session (navigateur fermé)", essential: true },
  { name: "simix_admin", purpose: "Session administrateur sécurisée", duration: "8 heures", essential: true },
  { name: "simix_csrf", purpose: "Protection contre les attaques CSRF", duration: "Session", essential: true },
  { name: "simix_lang", purpose: "Langue préférée de l'utilisateur", duration: "1 an", essential: true },
  { name: "_analytics", purpose: "Statistiques d'utilisation anonymisées", duration: "13 mois", essential: false },
  { name: "_theme", purpose: "Préférence de thème (clair/sombre)", duration: "1 an", essential: false },
];

export default function LegalCookies() {
  const [, setLocation] = useLocation();
  const { supportEmail, supportWhatsapp, supportPhone } = useContactSettings();

  const privacyEmail = supportEmail || "privacy@simix.app";
  const contactPhone = supportWhatsapp || supportPhone || "+225 07 00 00 00";

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/");
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="flex justify-center">
        <div className="w-full max-w-md bg-background relative shadow-2xl sm:border-x sm:border-border min-h-[100dvh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-6 pb-4 sticky top-0 bg-background/95 backdrop-blur-sm z-20 border-b border-card-border/50">
            <button
              onClick={goBack}
              className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
            <SimixLogo size={28} />
            <div className="w-9 h-9" />
          </div>

          <div className="px-5 pt-4 pb-20">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">

              <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-5">
                <Cookie className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-400">Politique des cookies</p>
                  <p className="text-xs text-muted-foreground">Dernière mise à jour : 1er janvier 2026</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-5">
                Simix utilise des cookies et technologies similaires pour faire fonctionner son application, améliorer votre expérience et analyser l'utilisation de nos services.
              </p>

              <Section title="1. Qu'est-ce qu'un cookie ?">
                <p>Un cookie est un petit fichier texte stocké sur votre appareil lorsque vous utilisez notre application. Les cookies permettent à l'application de se souvenir de vos préférences, de maintenir votre session de connexion et d'analyser l'utilisation du service.</p>
              </Section>

              <Section title="2. Types de cookies utilisés">
                <p><strong className="text-foreground">Cookies strictement nécessaires</strong></p>
                <p>Indispensables au fonctionnement de l'application. Ils ne peuvent pas être désactivés.</p>
                <p className="mt-2"><strong className="text-foreground">Cookies de performance et d'analyse</strong></p>
                <p>Recueillent des informations anonymisées sur la façon dont vous utilisez l'application. Ils nous aident à améliorer nos services.</p>
                <p className="mt-2"><strong className="text-foreground">Cookies de préférences</strong></p>
                <p>Mémorisent vos choix (langue, thème visuel) pour personnaliser votre expérience.</p>
              </Section>

              <Section title="3. Liste des cookies">
                <div className="space-y-2 mt-1">
                  {COOKIES.map((c) => (
                    <div key={c.name} className="bg-card border border-card-border rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-xs font-bold text-primary">{c.name}</code>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                          {c.essential ? "Essentiel" : "Optionnel"}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{c.purpose}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Durée : {c.duration}</p>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="4. Cookies tiers">
                <p>• <strong className="text-foreground">Supabase :</strong> base de données et authentification (cookies de session technique)</p>
                <p>• <strong className="text-foreground">CDN de contenu :</strong> accélération du chargement des ressources</p>
                <p>Nous n'utilisons aucun cookie publicitaire de tiers tels que Google Ads ou Facebook Pixel.</p>
              </Section>

              <Section title="5. Comment contrôler les cookies ?">
                <p>Dans l'application Simix, rendez-vous dans Profil → Confidentialité pour gérer vos préférences de cookies non essentiels.</p>
                <p className="mt-2">Via les paramètres de votre navigateur, vous pouvez contrôler les cookies si vous accédez à Simix via un navigateur web.</p>
              </Section>

              <Section title="6. Durée de validité du consentement">
                <p>Votre consentement aux cookies optionnels est valable pour une durée de 13 mois. Vous pouvez à tout moment modifier vos préférences depuis la section Confidentialité de votre profil.</p>
              </Section>

              <Section title="7. Contact">
                <p>Email : {privacyEmail}</p>
                {contactPhone && <p>WhatsApp / Téléphone : {contactPhone}</p>}
              </Section>

              <div className="text-center py-4">
                <p className="text-[10px] text-muted-foreground/50">© 2026 Simix Technologies · Tous droits réservés</p>
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </div>
  );
}
