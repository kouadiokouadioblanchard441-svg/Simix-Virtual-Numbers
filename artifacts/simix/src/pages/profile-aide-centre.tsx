import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, BookOpen, CreditCard, Smartphone,
  ShieldCheck, HelpCircle, ChevronDown, Search,
  Zap, Wallet, MessageCircle, Clock, CheckCircle2,
} from "lucide-react";

const CATEGORIES = [
  {
    id: "demarrer",
    icon: Zap,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    title: "Démarrer avec Simix",
    articles: [
      {
        title: "Comment créer un compte ?",
        content: `1. Téléchargez l'application Simix et ouvrez-la.\n2. Appuyez sur "Créer un compte".\n3. Entrez votre numéro de téléphone et suivez les étapes de vérification.\n4. Choisissez un mot de passe sécurisé (min. 8 caractères, majuscule + chiffre).\n5. Votre compte est prêt ! Rechargez votre solde pour commencer.`,
      },
      {
        title: "Comment ça marche ?",
        content: `Simix vous permet d'obtenir un numéro virtuel temporaire pour recevoir des SMS de vérification :\n\n1. Choisissez le service que vous voulez vérifier (WhatsApp, Telegram, Google...)\n2. Sélectionnez un pays et achetez un numéro\n3. Entrez ce numéro dans le service\n4. Attendez le SMS — il arrive en général en moins d'1 minute\n5. Copiez le code de vérification et utilisez-le`,
      },
      {
        title: "Quels services sont disponibles ?",
        content: `Simix supporte des centaines de services : WhatsApp, Telegram, Google, TikTok, Facebook, Instagram, Snapchat, Discord, Twitter/X, Signal, Microsoft, Apple, et bien plus encore.\n\nLes services sont mis à jour régulièrement. Utilisez la barre de recherche pour trouver votre service.`,
      },
    ],
  },
  {
    id: "recharger",
    icon: Wallet,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    title: "Recharger mon compte",
    articles: [
      {
        title: "Comment recharger mon solde ?",
        content: `1. Allez dans l'onglet "Solde" (icône portefeuille)\n2. Appuyez sur "+ Recharger"\n3. Choisissez votre opérateur Mobile Money (Orange Money, MTN, Wave, Moov...)\n4. Entrez le montant souhaité\n5. Suivez les instructions de confirmation\n\nLe rechargement est instantané dans la majorité des cas.`,
      },
      {
        title: "Quels opérateurs sont acceptés ?",
        content: `Simix accepte les principaux opérateurs Mobile Money d'Afrique de l'Ouest :\n\n• Orange Money (CI, SN, ML, BF, CM...)\n• MTN Mobile Money (CI, GH, CM, UG...)\n• Wave (CI, SN, ML, BF)\n• Moov Money (CI, BF, BJ, TG)\n• M-Pesa et autres selon les pays\n\nLes opérateurs disponibles varient selon votre pays.`,
      },
      {
        title: "Quel est le montant minimum ?",
        content: `Le dépôt minimum est fixé par l'administrateur de la plateforme. Il est généralement de 500 FCFA.\n\nIl n'y a pas de maximum fixe, mais votre solde total ne peut pas dépasser la limite définie pour votre compte.`,
      },
    ],
  },
  {
    id: "numeros",
    icon: Smartphone,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    title: "Numéros virtuels",
    articles: [
      {
        title: "Combien de temps dure un numéro ?",
        content: `Par défaut, un numéro virtuel reste actif pendant 15 minutes — largement suffisant pour recevoir un SMS.\n\nSi le SMS n'arrive pas dans ce délai, vous pouvez :\n• Prolonger de 5 minutes supplémentaires\n• Annuler et récupérer votre solde automatiquement`,
      },
      {
        title: "Je ne reçois pas le SMS — que faire ?",
        content: `Si le SMS n'arrive pas après 2-3 minutes :\n\n1. Vérifiez que vous avez bien entré le numéro dans le service\n2. Certains services envoient le SMS avec un léger délai\n3. Essayez de renvoyer le code depuis le service\n4. Si toujours rien après 5 min → Annulez le numéro pour récupérer votre solde\n\nVotre solde est remboursé automatiquement si aucun SMS n'est reçu.`,
      },
      {
        title: "Puis-je réutiliser un numéro ?",
        content: `Non, chaque numéro virtuel est à usage unique. Une fois utilisé ou expiré, il est désactivé.\n\nPour vérifier plusieurs comptes ou services différents, achetez un numéro distinct pour chaque vérification. Cela garantit votre confidentialité et la sécurité de chaque compte.`,
      },
      {
        title: "Comment annuler et être remboursé ?",
        content: `1. Allez dans "Mes numéros actifs"\n2. Appuyez sur le numéro concerné\n3. Cliquez sur "Annuler le numéro"\n4. Confirmez l'annulation\n\nLe remboursement est crédité instantanément sur votre solde Simix si aucun SMS n'a été reçu.`,
      },
    ],
  },
  {
    id: "securite",
    icon: ShieldCheck,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    title: "Sécurité & Compte",
    articles: [
      {
        title: "Comment changer mon mot de passe ?",
        content: `1. Allez dans Profil → Sécurité\n2. Appuyez sur "Changer le mot de passe"\n3. Entrez votre mot de passe actuel\n4. Entrez et confirmez le nouveau mot de passe\n5. Sauvegardez\n\nChoisissez un mot de passe fort : minimum 8 caractères, au moins 1 majuscule et 1 chiffre.`,
      },
      {
        title: "Simix est-il sécurisé ?",
        content: `Oui. Simix applique des mesures de sécurité strictes :\n\n• Données chiffrées en transit (HTTPS/TLS)\n• Mots de passe hachés (bcrypt)\n• Numéros virtuels temporaires détruits après usage\n• Aucune donnée bancaire stockée sur nos serveurs\n• Surveillance anti-fraude en temps réel\n• Sessions expirées automatiquement`,
      },
      {
        title: "Que faire si mon compte est compromis ?",
        content: `Si vous suspectez une activité suspecte :\n\n1. Changez immédiatement votre mot de passe\n2. Allez dans Sécurité → Déconnecter tous les appareils\n3. Contactez notre support via WhatsApp ou email\n\nNous pouvons bloquer votre compte temporairement et enquêter sur toute activité frauduleuse.`,
      },
    ],
  },
  {
    id: "paiements",
    icon: CreditCard,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    title: "Paiements & Remboursements",
    articles: [
      {
        title: "Comment fonctionne le remboursement ?",
        content: `Le remboursement est automatique dans ces cas :\n\n• Aucun SMS reçu dans le délai imparti → remboursement instantané\n• Erreur technique de notre côté → crédit automatique\n\nPour un remboursement manuel, contactez le support avec votre numéro de commande. Traitement en moins de 2h.`,
      },
      {
        title: "Mon paiement est bloqué ?",
        content: `Si votre rechargement Mobile Money est bloqué :\n\n1. Vérifiez votre crédit Mobile Money\n2. Assurez-vous d'avoir confirmé la transaction sur votre téléphone\n3. Attendez 5 minutes et vérifiez votre solde Simix\n4. Si le problème persiste, contactez le support avec votre référence de transaction`,
      },
      {
        title: "Y a-t-il des frais ?",
        content: `Le prix affiché pour chaque numéro virtuel est le prix final, tout compris. Il n'y a pas de frais cachés.\n\nPour les dépôts, des frais de traitement peuvent s'appliquer selon l'opérateur Mobile Money (généralement inclus dans le montant affiché).`,
      },
    ],
  },
  {
    id: "autres",
    icon: HelpCircle,
    color: "text-zinc-400",
    bg: "bg-zinc-500/10 border-zinc-500/20",
    title: "Autres questions",
    articles: [
      {
        title: "Puis-je utiliser Simix dans mon pays ?",
        content: `Simix est disponible dans la majorité des pays d'Afrique de l'Ouest et d'Afrique Centrale. Les opérateurs de paiement disponibles varient selon le pays.\n\nPour les numéros virtuels, vous pouvez choisir des numéros de n'importe quel pays supporté, indépendamment de votre localisation.`,
      },
      {
        title: "Comment contacter le support ?",
        content: `Notre support est disponible du lundi au samedi, de 7h à 22h :\n\n• WhatsApp : réponse en ~15 minutes\n• Email : réponse en moins de 2 heures\n• Pour les urgences : utilisez WhatsApp\n\nMerci de préciser votre numéro de commande ou de transaction pour un traitement plus rapide.`,
      },
      {
        title: "Comment signaler un bug ?",
        content: `Vous pouvez signaler un bug en :\n\n1. Envoyant un email avec la description du problème, les étapes pour le reproduire, et une capture d'écran si possible\n2. Via WhatsApp en précisant "signalement de bug"\n\nVos retours nous aident à améliorer l'application. Merci !`,
      },
    ],
  },
];

function ArticleItem({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-card-border/60 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-medium text-foreground leading-snug">{title}</span>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-card-border/40 pt-3">
              {content.split("\n").map((line, i) => (
                <p key={i} className={`text-xs text-muted-foreground leading-relaxed ${line === "" ? "mt-2" : "mt-0.5"}`}>
                  {line || "\u00A0"}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProfileAideCentre() {
  return (
    <AuthGuard>
      <AppLayout>
        <AideCentreContent />
      </AppLayout>
    </AuthGuard>
  );
}

function AideCentreContent() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const allArticles = CATEGORIES.flatMap(c => c.articles.map(a => ({ ...a, catTitle: c.title, catIcon: c.icon, catColor: c.color })));
  const searchResults = search.length >= 2
    ? allArticles.filter(a => a.title.toLowerCase().includes(search.toLowerCase()) || a.content.toLowerCase().includes(search.toLowerCase()))
    : [];

  const filteredCategories = activeCategory
    ? CATEGORIES.filter(c => c.id === activeCategory)
    : CATEGORIES;

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
      <div className="flex items-center justify-between mb-4 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-6 pb-3 border-b border-card-border/50">
        <button onClick={() => setLocation("/profile/aide")} className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Centre d'aide</h1>
        <div className="w-9 h-9" />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        {/* Hero */}
        <div className="bg-gradient-to-br from-violet-600/20 to-violet-900/10 border border-violet-500/20 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Comment pouvons-nous vous aider ?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Guides, tutoriels et réponses à vos questions</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un article..."
            className="w-full pl-9 pr-4 py-3 bg-card border border-card-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        {/* Search results */}
        {search.length >= 2 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">{searchResults.length} résultat(s) pour "{search}"</p>
            {searchResults.length === 0 ? (
              <div className="bg-card border border-card-border rounded-2xl p-6 text-center">
                <HelpCircle className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucun article trouvé</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Contactez notre support pour de l'aide personnalisée</p>
              </div>
            ) : (
              searchResults.map((a, i) => <ArticleItem key={i} title={a.title} content={a.content} />)
            )}
          </div>
        )}

        {/* Stats */}
        {!search && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: BookOpen, label: "Articles", value: `${allArticles.length}+`, color: "text-violet-400" },
              { icon: Clock, label: "Réponse", value: "< 2h", color: "text-emerald-400" },
              { icon: CheckCircle2, label: "Résolus", value: "98%", color: "text-blue-400" },
            ].map(s => (
              <div key={s.label} className="bg-card border border-card-border rounded-xl p-3 text-center">
                <s.icon className={`w-4 h-4 ${s.color} mx-auto mb-1`} />
                <p className="text-sm font-bold text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Category filter */}
        {!search && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-5 px-5 pb-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                !activeCategory ? "bg-primary text-white border-primary" : "bg-card border-card-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              Tous
            </button>
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(activeCategory === c.id ? null : c.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  activeCategory === c.id ? "bg-primary text-white border-primary" : "bg-card border-card-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                <c.icon className="w-3 h-3" />
                {c.title}
              </button>
            ))}
          </div>
        )}

        {/* Categories and articles */}
        {!search && filteredCategories.map((cat) => (
          <div key={cat.id} className="space-y-2">
            <div className={`flex items-center gap-3 p-4 border rounded-2xl ${cat.bg}`}>
              <cat.icon className={`w-5 h-5 ${cat.color} flex-shrink-0`} />
              <div>
                <p className={`text-sm font-bold ${cat.color}`}>{cat.title}</p>
                <p className="text-xs text-muted-foreground">{cat.articles.length} article{cat.articles.length > 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="space-y-2 pl-1">
              {cat.articles.map((article, i) => (
                <ArticleItem key={i} title={article.title} content={article.content} />
              ))}
            </div>
          </div>
        ))}

        {/* Contact CTA */}
        <div className="bg-card border border-card-border rounded-2xl p-4">
          <p className="text-sm font-bold text-foreground mb-1">Vous n'avez pas trouvé votre réponse ?</p>
          <p className="text-xs text-muted-foreground mb-3">Notre équipe répond en moins de 2 heures</p>
          <button
            onClick={() => setLocation("/profile/aide")}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Contacter le support
          </button>
        </div>
      </motion.div>
    </div>
  );
}
