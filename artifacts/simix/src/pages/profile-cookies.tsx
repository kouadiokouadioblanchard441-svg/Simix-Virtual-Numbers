import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Cookie } from "lucide-react";

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

export default function ProfileCookies() {
  return (
    <AuthGuard>
      <AppLayout>
        <CookiesContent />
      </AppLayout>
    </AuthGuard>
  );
}

function CookiesContent() {
  const [, setLocation] = useLocation();
  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-6 pb-3 border-b border-card-border/50">
        <button onClick={() => setLocation("/profile/confidentialite")} className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Politique des cookies</h1>
        <div className="w-9 h-9" />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl mb-5">
          <Cookie className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-400">Politique des cookies</p>
            <p className="text-xs text-muted-foreground">Dernière mise à jour : 1er janvier 2026</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-5">
          Simix utilise des cookies et technologies similaires pour faire fonctionner son application, améliorer votre expérience et analyser l'utilisation de nos services. Cette page vous explique ce qu'ils sont, pourquoi nous les utilisons et comment les contrôler.
        </p>

        <Section title="1. Qu'est-ce qu'un cookie ?">
          <p>Un cookie est un petit fichier texte stocké sur votre appareil (téléphone, tablette, ordinateur) lorsque vous utilisez notre application. Les cookies permettent à l'application de se souvenir de vos préférences, de maintenir votre session de connexion et d'analyser l'utilisation du service.</p>
          <p>Dans le cadre d'une application mobile, des technologies similaires sont également utilisées : stockage local (localStorage, sessionStorage), jetons d'authentification et identifiants de session côté serveur.</p>
        </Section>

        <Section title="2. Types de cookies utilisés">
          <p><strong className="text-foreground">Cookies strictement nécessaires</strong></p>
          <p>Ces cookies sont indispensables au fonctionnement de l'application. Sans eux, certains services ne peuvent pas fonctionner. Ils ne peuvent pas être désactivés.</p>
          <p className="mt-2"><strong className="text-foreground">Cookies de performance et d'analyse</strong></p>
          <p>Ces cookies recueillent des informations anonymisées sur la façon dont vous utilisez l'application (pages visitées, erreurs rencontrées, temps passé). Ils nous aident à améliorer nos services.</p>
          <p className="mt-2"><strong className="text-foreground">Cookies de préférences</strong></p>
          <p>Ces cookies mémorisent vos choix (langue, thème visuel) pour personnaliser votre expérience.</p>
        </Section>

        <Section title="3. Liste des cookies">
          <div className="space-y-2 mt-1">
            {COOKIES.map((c) => (
              <div key={c.name} className="bg-card border border-card-border rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <code className="text-xs font-bold text-primary">{c.name}</code>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.essential ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
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
          <p>Certains services intégrés à Simix peuvent déposer leurs propres cookies :</p>
          <p>• <strong className="text-foreground">Supabase :</strong> base de données et authentification (cookies de session technique)</p>
          <p>• <strong className="text-foreground">CDN de contenu :</strong> accélération du chargement des ressources</p>
          <p>Nous n'utilisons aucun cookie publicitaire de tiers tels que Google Ads, Facebook Pixel ou équivalents.</p>
        </Section>

        <Section title="5. Comment contrôler les cookies ?">
          <p><strong className="text-foreground">Dans l'application Simix :</strong></p>
          <p>Rendez-vous dans Profil → Confidentialité pour gérer vos préférences de cookies non essentiels.</p>
          <p className="mt-2"><strong className="text-foreground">Via les paramètres de votre navigateur :</strong></p>
          <p>Si vous accédez à Simix via un navigateur web, vous pouvez contrôler les cookies dans les paramètres de votre navigateur. La désactivation des cookies essentiels peut empêcher le bon fonctionnement du service.</p>
          <p className="mt-2"><strong className="text-foreground">Sur mobile :</strong></p>
          <p>Sur iOS, allez dans Réglages → Safari → Confidentialité et sécurité. Sur Android, consultez les paramètres de votre navigateur par défaut.</p>
        </Section>

        <Section title="6. Durée de validité du consentement">
          <p>Votre consentement aux cookies optionnels est valable pour une durée de 13 mois. À l'expiration de ce délai, nous vous demanderons à nouveau votre consentement. Vous pouvez à tout moment modifier vos préférences depuis la section Confidentialité de votre profil.</p>
        </Section>

        <Section title="7. Contact">
          <p>Pour toute question relative à notre utilisation des cookies :</p>
          <p>Email : privacy@simix.app</p>
          <p>WhatsApp : +225 07 00 00 00</p>
        </Section>

        <div className="text-center py-4">
          <p className="text-[10px] text-muted-foreground/50">© 2026 Simix Technologies · Tous droits réservés</p>
        </div>
      </motion.div>
    </div>
  );
}
