import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Building2 } from "lucide-react";
import { useContactSettings } from "@/hooks/use-contact-settings";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
        <span className="w-1 h-4 rounded-full bg-primary flex-shrink-0" />
        {title}
      </h2>
      <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5 pl-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-card-border/40 last:border-0">
      <span className="text-xs text-muted-foreground/70 flex-shrink-0">{label}</span>
      <span className="text-xs text-foreground font-medium text-right">{value}</span>
    </div>
  );
}

export default function ProfileMentionsLegales() {
  return (
    <AuthGuard>
      <AppLayout>
        <MentionsContent />
      </AppLayout>
    </AuthGuard>
  );
}

function MentionsContent() {
  const [, setLocation] = useLocation();
  const { supportEmail, supportPhone, platformName } = useContactSettings();

  const displayPhone = supportPhone || "+225 07 00 00 00";
  const displayEmail = supportEmail || "contact@simix.app";

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-6 pb-3 border-b border-card-border/50">
        <button onClick={() => setLocation("/profile/confidentialite")} className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Mentions légales</h1>
        <div className="w-9 h-9" />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
        <div className="flex items-center gap-3 p-4 bg-violet-500/10 border border-violet-500/20 rounded-2xl mb-5">
          <Building2 className="w-5 h-5 text-violet-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-violet-400">Mentions Légales {platformName}</p>
            <p className="text-xs text-muted-foreground">Conformément aux lois en vigueur</p>
          </div>
        </div>

        <Section title="1. Éditeur de l'application">
          <div className="bg-card border border-card-border rounded-xl p-4">
            <InfoRow label="Dénomination sociale" value={`${platformName} Technologies`} />
            <InfoRow label="Forme juridique" value="Société à Responsabilité Limitée (SARL)" />
            <InfoRow label="Capital social" value="5 000 000 FCFA" />
            <InfoRow label="Siège social" value="Abidjan, Plateau, Côte d'Ivoire" />
            <InfoRow label="RCCM" value="CI-ABJ-2024-B-XXXXX" />
            <InfoRow label="N° Fiscal" value="XXXXX-XXXX-X" />
            <InfoRow label="Email" value={displayEmail} />
            {displayPhone && <InfoRow label="Téléphone" value={displayPhone} />}
            <InfoRow label="Directeur de publication" value={`Direction ${platformName} Technologies`} />
          </div>
        </Section>

        <Section title="2. Activité réglementée">
          <p>{platformName} Technologies opère en tant que prestataire de services de communications électroniques et de services fintech en Afrique de l'Ouest.</p>
          <p>Nos activités de paiement mobile sont réalisées en partenariat avec des établissements de paiement agréés par la Banque Centrale des États de l'Afrique de l'Ouest (BCEAO) et les autorités compétentes des pays où le service est disponible.</p>
          <p>{platformName} Technologies ne détient pas d'agrément d'établissement de paiement propre — les flux financiers sont traités par les opérateurs Mobile Money partenaires dûment agréés.</p>
        </Section>

        <Section title="3. Hébergement">
          <div className="bg-card border border-card-border rounded-xl p-4">
            <InfoRow label="Hébergeur principal" value="Supabase Inc." />
            <InfoRow label="Adresse" value="970 Toa Payoh North, Singapour" />
            <InfoRow label="Région des données" value="Europe de l'Ouest (AWS eu-west-1)" />
            <InfoRow label="Infrastructure" value="Amazon Web Services (AWS)" />
          </div>
          <p className="mt-2">Les données des utilisateurs sont stockées dans des centres de données situés dans l'Union Européenne, conformément au RGPD et aux exigences de protection des données.</p>
        </Section>

        <Section title="4. Propriété intellectuelle">
          <p>L'ensemble des éléments constituant l'application {platformName} (à titre non exhaustif : le code source, le design, les graphiques, les logos, les icônes, les textes, les bases de données) sont la propriété exclusive de {platformName} Technologies et sont protégés par le droit de la propriété intellectuelle en vigueur en Côte d'Ivoire et à l'international.</p>
          <p>Le nom et le logo <strong className="text-foreground">{platformName}</strong> sont des marques déposées de {platformName} Technologies. Toute reproduction, représentation, modification, publication ou adaptation de tout ou partie de ces éléments, quel que soit le moyen ou le procédé utilisé, est interdite sans l'autorisation écrite préalable de {platformName} Technologies.</p>
          <p>Toute exploitation non autorisée peut constituer une contrefaçon et donner lieu à des poursuites judiciaires.</p>
        </Section>

        <Section title="5. Liens hypertextes">
          <p>L'application {platformName} peut contenir des liens vers des sites ou applications de tiers. Ces liens sont fournis à titre informatif uniquement. {platformName} Technologies n'est pas responsable du contenu de ces sites tiers et ne saurait être tenu pour responsable des dommages résultant de leur utilisation.</p>
        </Section>

        <Section title="6. Disponibilité du service">
          <p>{platformName} Technologies s'efforce d'assurer la continuité de service mais ne peut garantir que l'application sera accessible en permanence. Des interruptions techniques, des opérations de maintenance ou des événements de force majeure peuvent temporairement rendre le service inaccessible.</p>
          <p>En cas d'indisponibilité prolongée, {platformName} Technologies s'engage à informer ses utilisateurs via les canaux disponibles (notification in-app, email, WhatsApp).</p>
        </Section>

        <Section title="7. Droit applicable et juridiction">
          <p>Les présentes mentions légales sont régies par le droit ivoirien. En cas de litige relatif à l'interprétation ou à l'exécution des présentes, les parties s'engagent à rechercher une solution amiable. À défaut d'accord amiable dans un délai de 60 jours, le litige sera soumis à la juridiction exclusive du Tribunal de Commerce d'Abidjan.</p>
        </Section>

        <Section title="8. Médiation">
          <p>Conformément aux dispositions légales en vigueur, tout consommateur a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable d'un litige. Pour toute réclamation, vous pouvez contacter notre service client à :</p>
          <p>• Email : {displayEmail}</p>
          {displayPhone && <p>• WhatsApp / Téléphone : {displayPhone}</p>}
          <p>• Courrier : {platformName} Technologies, Abidjan, Plateau, Côte d'Ivoire</p>
        </Section>

        <Section title="9. Crédits">
          <p>• <strong className="text-foreground">Icônes :</strong> Lucide Icons (ISC License)</p>
          <p>• <strong className="text-foreground">Framework UI :</strong> React + Vite + Tailwind CSS</p>
          <p>• <strong className="text-foreground">Animations :</strong> Framer Motion</p>
          <p>• <strong className="text-foreground">Base de données :</strong> Supabase (PostgreSQL)</p>
          <p>• <strong className="text-foreground">Polices :</strong> Inter (Google Fonts, OFL License)</p>
        </Section>

        <div className="bg-card border border-card-border rounded-2xl p-4 text-center">
          <p className="text-xs font-bold text-foreground mb-1">{platformName} Technologies</p>
          <p className="text-[11px] text-muted-foreground">Abidjan, Côte d'Ivoire</p>
          <p className="text-[11px] text-muted-foreground">{displayEmail}</p>
          <p className="text-[10px] text-muted-foreground/50 mt-3">© 2026 {platformName} Technologies · Tous droits réservés</p>
        </div>
      </motion.div>
    </div>
  );
}
