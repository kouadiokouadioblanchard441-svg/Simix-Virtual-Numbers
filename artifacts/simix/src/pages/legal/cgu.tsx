import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, FileText } from "lucide-react";
import { SimixLogo } from "@/components/simix-logo";

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

export default function LegalCGU() {
  const [, setLocation] = useLocation();

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

          <div className="px-5 pt-4 pb-20 overflow-y-auto">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">

              <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl mb-5">
                <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-blue-400">Conditions Générales d'Utilisation</p>
                  <p className="text-xs text-muted-foreground">En vigueur depuis le 1er janvier 2026</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-5">
                Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de l'application mobile et des services proposés par <strong className="text-foreground">Simix Technologies</strong>. En créant un compte ou en utilisant nos services, vous acceptez sans réserve les présentes conditions.
              </p>

              <Section title="1. Présentation du service">
                <p>Simix est une plateforme fintech africaine permettant à ses utilisateurs d'acquérir des numéros de téléphone virtuels temporaires pour recevoir des codes de vérification SMS auprès de diverses applications et services en ligne.</p>
                <p>Le service comprend :</p>
                <p>• Un portefeuille électronique rechargeable via Mobile Money</p>
                <p>• L'achat de numéros virtuels internationaux</p>
                <p>• La réception de SMS de vérification en temps réel</p>
                <p>• Un historique complet des transactions</p>
              </Section>

              <Section title="2. Conditions d'accès">
                <p>Pour utiliser Simix, vous devez :</p>
                <p>• Être âgé d'au moins 18 ans (ou de l'âge légal de majorité dans votre pays)</p>
                <p>• Disposer d'un numéro de téléphone mobile valide</p>
                <p>• Résider dans un pays où le service est disponible</p>
                <p>• Fournir des informations exactes et complètes lors de l'inscription</p>
                <p>• Ne pas avoir été suspendu ou banni de la plateforme</p>
                <p>Simix se réserve le droit de refuser ou de suspendre l'accès à tout utilisateur ne respectant pas ces conditions.</p>
              </Section>

              <Section title="3. Création de compte">
                <p>Vous êtes responsable de la confidentialité de vos identifiants de connexion. Vous vous engagez à :</p>
                <p>• Ne pas partager votre mot de passe avec des tiers</p>
                <p>• Nous notifier immédiatement en cas de compromission de votre compte</p>
                <p>• Maintenir vos informations à jour et exactes</p>
                <p>• N'avoir qu'un seul compte par personne physique</p>
                <p>Simix ne peut être tenu responsable des pertes résultant d'une utilisation non autorisée de votre compte.</p>
              </Section>

              <Section title="4. Utilisation des services">
                <p><strong className="text-foreground">Utilisations autorisées :</strong></p>
                <p>Les numéros virtuels Simix sont destinés exclusivement à la réception de codes de vérification SMS pour la création ou la vérification de comptes sur des services légaux.</p>
                <p><strong className="text-foreground">Utilisations interdites :</strong></p>
                <p>Il est strictement interdit d'utiliser Simix pour :</p>
                <p>• Contourner des systèmes de sécurité de manière frauduleuse</p>
                <p>• Créer de faux comptes en masse sur des plateformes tierces</p>
                <p>• Toute activité illégale, frauduleuse ou malveillante</p>
                <p>• Le blanchiment d'argent ou le financement d'activités illicites</p>
                <p>• Usurper l'identité de tiers</p>
                <p>• Envoyer du spam ou du contenu abusif</p>
                <p>Toute violation entraîne la suspension immédiate du compte sans remboursement.</p>
              </Section>

              <Section title="5. Portefeuille et paiements">
                <p>Le portefeuille Simix est un compte de valeur stockée, non rémunéré, utilisable exclusivement sur la plateforme.</p>
                <p>• Les rechargements sont effectués via les opérateurs Mobile Money partenaires</p>
                <p>• Les transactions sont définitives une fois confirmées par l'opérateur</p>
                <p>• Le solde minimum de transaction est de 50 FCFA</p>
                <p>• Le solde maximum autorisé est de 500 000 FCFA sauf dérogation accordée par Simix</p>
                <p>• Les fonds non utilisés restent disponibles sans date d'expiration</p>
              </Section>

              <Section title="6. Tarification">
                <p>Les prix des numéros virtuels sont affichés en temps réel dans l'application et peuvent varier selon :</p>
                <p>• Le pays du numéro virtuel</p>
                <p>• Le service pour lequel le numéro est utilisé</p>
                <p>• La disponibilité des stocks</p>
                <p>Simix se réserve le droit de modifier ses tarifs avec un préavis de 48 heures.</p>
              </Section>

              <Section title="7. Remboursements">
                <p>Un remboursement automatique du solde est effectué si aucun SMS n'est reçu dans le délai imparti (généralement 15 minutes). Dans ce cas :</p>
                <p>• Le montant de l'achat est recrédité sur votre portefeuille Simix</p>
                <p>• Aucun délai de traitement — le remboursement est instantané</p>
                <p>En revanche, les rechargements du portefeuille ne sont pas remboursables en espèces ou sur votre compte Mobile Money d'origine.</p>
              </Section>

              <Section title="8. Disponibilité du service">
                <p>Simix s'efforce d'assurer la disponibilité de son service 24h/24 et 7j/7. Toutefois, des interruptions peuvent survenir pour :</p>
                <p>• Maintenance planifiée (annoncée à l'avance)</p>
                <p>• Problèmes techniques indépendants de notre volonté</p>
                <p>• Défaillances des fournisseurs tiers</p>
                <p>Simix ne peut être tenu responsable des préjudices liés à l'indisponibilité du service.</p>
              </Section>

              <Section title="9. Propriété intellectuelle">
                <p>L'ensemble des éléments de l'application Simix (code, design, logos, textes, bases de données) sont la propriété exclusive de Simix Technologies et sont protégés par le droit de la propriété intellectuelle.</p>
                <p>Toute reproduction, modification ou exploitation non autorisée est interdite et pourra faire l'objet de poursuites.</p>
              </Section>

              <Section title="10. Responsabilité">
                <p>La responsabilité de Simix est limitée au montant des sommes versées par l'utilisateur au cours des 30 derniers jours. Simix ne saurait être tenu responsable :</p>
                <p>• Des pertes indirectes, consécutives ou immatérielles</p>
                <p>• Des problèmes résultant d'une mauvaise utilisation du service</p>
                <p>• Des dommages liés aux services des opérateurs Mobile Money partenaires</p>
                <p>• Des décisions des plateformes tierces concernant vos comptes</p>
              </Section>

              <Section title="11. Modification des CGU">
                <p>Simix se réserve le droit de modifier les présentes CGU. Vous serez notifié dans l'application 30 jours avant toute modification substantielle. La poursuite de l'utilisation du service après cette date vaut acceptation des nouvelles conditions.</p>
              </Section>

              <Section title="12. Droit applicable">
                <p>Les présentes CGU sont régies par le droit ivoirien. En cas de litige, les parties s'engagent à rechercher une solution amiable avant tout recours judiciaire. À défaut, le Tribunal de Commerce d'Abidjan sera seul compétent.</p>
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
