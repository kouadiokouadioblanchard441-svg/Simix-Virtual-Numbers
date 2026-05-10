import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Shield } from "lucide-react";
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

export default function LegalPolitiqueConfidentialite() {
  const [, setLocation] = useLocation();
  const { supportEmail, supportPhone, supportWhatsapp, platformName } = useContactSettings();

  const displayPhone = supportPhone || supportWhatsapp || "+225 07 00 00 00";
  const privacyEmail = supportEmail || "privacy@simix.app";
  const whatsappDisplay = supportWhatsapp || supportPhone || "+225 07 00 00 00";

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

              <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-2xl mb-5">
                <Shield className="w-5 h-5 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-primary">{platformName} Technologies</p>
                  <p className="text-xs text-muted-foreground">Dernière mise à jour : 1er janvier 2026</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-5">
                La présente politique de confidentialité décrit la manière dont <strong className="text-foreground">{platformName} Technologies</strong> collecte, utilise, stocke et protège vos données personnelles lorsque vous utilisez notre application mobile et nos services.
              </p>

              <Section title="1. Responsable du traitement">
                <p>Le responsable du traitement des données personnelles est :</p>
                <div className="bg-card border border-card-border rounded-xl p-3 mt-2 space-y-1">
                  <p><strong className="text-foreground">{platformName} Technologies</strong></p>
                  <p>Abidjan, Côte d'Ivoire</p>
                  <p>Email : {privacyEmail}</p>
                  {displayPhone && <p>Téléphone : {displayPhone}</p>}
                </div>
              </Section>

              <Section title="2. Données collectées">
                <p><strong className="text-foreground">Données d'identification :</strong> nom complet, nom d'utilisateur, adresse e-mail, numéro de téléphone, pays de résidence.</p>
                <p><strong className="text-foreground">Données financières :</strong> historique des transactions, solde du portefeuille, méthodes de paiement Mobile Money utilisées (sans stockage des données bancaires sensibles).</p>
                <p><strong className="text-foreground">Données d'utilisation :</strong> numéros virtuels achetés, services utilisés, historique de navigation dans l'application.</p>
                <p><strong className="text-foreground">Données techniques :</strong> adresse IP, type d'appareil, système d'exploitation, identifiant de session, logs de connexion.</p>
                <p><strong className="text-foreground">Communications :</strong> messages envoyés à notre service support, évaluations et retours laissés dans l'application.</p>
              </Section>

              <Section title="3. Finalités du traitement">
                <p>• Création et gestion de votre compte utilisateur</p>
                <p>• Fourniture des services de numéros virtuels SMS</p>
                <p>• Traitement des paiements Mobile Money (Orange Money, MTN, Wave, etc.)</p>
                <p>• Prévention de la fraude et sécurité des transactions</p>
                <p>• Assistance clientèle et résolution des litiges</p>
                <p>• Envoi de notifications transactionnelles et de sécurité</p>
                <p>• Amélioration de nos services (sur la base de données anonymisées)</p>
                <p>• Respect de nos obligations légales et réglementaires</p>
              </Section>

              <Section title="4. Base légale du traitement">
                <p>• <strong className="text-foreground">Exécution du contrat :</strong> traitement nécessaire à la fourniture de nos services</p>
                <p>• <strong className="text-foreground">Intérêt légitime :</strong> sécurité, prévention de la fraude, amélioration des services</p>
                <p>• <strong className="text-foreground">Consentement :</strong> communications marketing, cookies non essentiels</p>
                <p>• <strong className="text-foreground">Obligation légale :</strong> conservation des données financières conformément à la réglementation applicable</p>
              </Section>

              <Section title="5. Durée de conservation">
                <p>• <strong className="text-foreground">Données de compte :</strong> pendant toute la durée de votre relation avec {platformName}, puis 3 ans après la clôture</p>
                <p>• <strong className="text-foreground">Données de transactions :</strong> 5 ans à compter de la date de la transaction</p>
                <p>• <strong className="text-foreground">Logs de connexion :</strong> 12 mois</p>
                <p>• <strong className="text-foreground">Données de support :</strong> 3 ans après résolution</p>
              </Section>

              <Section title="6. Partage des données">
                <p>Nous ne vendons jamais vos données personnelles. Nous pouvons partager certaines données avec :</p>
                <p>• <strong className="text-foreground">Fournisseurs de numéros virtuels :</strong> pour la fourniture du service (uniquement les données nécessaires)</p>
                <p>• <strong className="text-foreground">Opérateurs Mobile Money :</strong> pour le traitement des paiements</p>
                <p>• <strong className="text-foreground">Hébergeurs et prestataires techniques :</strong> opérant sous strict accord de confidentialité</p>
                <p>• <strong className="text-foreground">Autorités compétentes :</strong> en cas d'obligation légale ou de réquisition judiciaire</p>
              </Section>

              <Section title="7. Sécurité des données">
                <p>• Chiffrement des données en transit (TLS 1.3) et au repos (AES-256)</p>
                <p>• Authentification sécurisée avec hachage bcrypt des mots de passe</p>
                <p>• Accès restreint aux données par le personnel autorisé uniquement</p>
                <p>• Surveillance continue des accès et des anomalies</p>
                <p>• Sauvegardes régulières avec chiffrement</p>
                <p>• Aucune donnée de carte bancaire n'est jamais stockée sur nos serveurs</p>
              </Section>

              <Section title="8. Vos droits">
                <p>• <strong className="text-foreground">Droit d'accès :</strong> obtenir une copie de vos données personnelles</p>
                <p>• <strong className="text-foreground">Droit de rectification :</strong> corriger vos données inexactes</p>
                <p>• <strong className="text-foreground">Droit à l'effacement :</strong> demander la suppression de vos données</p>
                <p>• <strong className="text-foreground">Droit à la portabilité :</strong> recevoir vos données dans un format structuré</p>
                <p>• <strong className="text-foreground">Droit d'opposition :</strong> vous opposer à certains traitements</p>
                <p>Pour exercer ces droits, contactez-nous à {privacyEmail}. Nous répondons dans un délai de 30 jours.</p>
              </Section>

              <Section title="9. Transferts internationaux">
                <p>Vos données sont principalement hébergées dans des centres de données situés en Europe (Union Européenne) et en Afrique de l'Ouest. Tout transfert vers des pays tiers est encadré par des garanties appropriées.</p>
              </Section>

              <Section title="10. Contact & réclamations">
                <p>Email : {privacyEmail}</p>
                {whatsappDisplay && <p>WhatsApp / Téléphone : {whatsappDisplay}</p>}
              </Section>

              <div className="text-center py-4">
                <p className="text-[10px] text-muted-foreground/50">© 2026 {platformName} Technologies · Tous droits réservés</p>
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </div>
  );
}
