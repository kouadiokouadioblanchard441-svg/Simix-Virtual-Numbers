import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Star, CreditCard, CheckCircle, X, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatFCFA } from "@/lib/format";

type PayMethod = {
  id: string;
  operator: string;
  color: string;
  abbr: string;
  phone: string;
  name: string;
  isDefault: boolean;
  lastUsed: string;
};

const OPERATORS = [
  { name: "Orange Money", abbr: "OM", color: "#FF7A00", bg: "#FF7A001a" },
  { name: "MTN MoMo", abbr: "MTN", color: "#FFCC00", bg: "#FFCC001a" },
  { name: "Wave", abbr: "WV", color: "#1BC5F4", bg: "#1BC5F41a" },
  { name: "Moov Money", abbr: "MV", color: "#E2001A", bg: "#E2001A1a" },
  { name: "M-Pesa", abbr: "MP", color: "#4CAF50", bg: "#4CAF501a" },
  { name: "Free Money", abbr: "FM", color: "#E30613", bg: "#E306131a" },
];

export default function ProfilePaiement() {
  return (
    <AuthGuard>
      <AppLayout>
        <PaiementContent />
      </AppLayout>
    </AuthGuard>
  );
}

function PaiementContent() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [methods, setMethods] = useState<PayMethod[]>([
    { id: "1", operator: "Orange Money", abbr: "OM", color: "#FF7A00", phone: user?.phone ?? "+225 07 01 23 45 67", name: user?.fullName ?? "Mon compte", isDefault: true, lastUsed: "Il y a 2 jours" },
  ]);
  const [newOp, setNewOp] = useState(OPERATORS[0].name);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    if (!newPhone.trim() || newPhone.length < 8) {
      toast({ title: "Erreur", description: "Numéro de téléphone invalide.", variant: "destructive" });
      return;
    }
    const op = OPERATORS.find((o) => o.name === newOp)!;
    const m: PayMethod = {
      id: Date.now().toString(),
      operator: op.name,
      abbr: op.abbr,
      color: op.color,
      phone: newPhone,
      name: newName || newOp,
      isDefault: methods.length === 0,
      lastUsed: "Jamais utilisé",
    };
    setMethods((prev) => [...prev, m]);
    setNewPhone("");
    setNewName("");
    setShowAdd(false);
    toast({ title: "Méthode ajoutée", description: `${op.name} a été ajouté à vos méthodes de paiement.` });
  };

  const handleDefault = (id: string) => {
    setMethods((prev) => prev.map((m) => ({ ...m, isDefault: m.id === id })));
    toast({ title: "Méthode par défaut", description: "Votre méthode de paiement par défaut a été mise à jour." });
  };

  const handleDelete = (id: string) => {
    const m = methods.find((m) => m.id === id);
    if (m?.isDefault) {
      toast({ title: "Action impossible", description: "Vous ne pouvez pas supprimer votre méthode par défaut.", variant: "destructive" });
      return;
    }
    setMethods((prev) => prev.filter((m) => m.id !== id));
    toast({ title: "Méthode supprimée", description: "La méthode de paiement a été retirée." });
  };

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-6 pb-3 border-b border-card-border/50">
        <button onClick={() => setLocation("/profile")} className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Méthodes de paiement</h1>
        <button onClick={() => setShowAdd(true)} className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4 text-white" />
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {/* Balance summary */}
        <div className="bg-gradient-to-br from-violet-900/40 to-background border border-card-border rounded-3xl p-5">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Solde disponible</p>
          <h2 className="text-3xl font-black text-foreground mb-1">{formatFCFA(user?.balance ?? 0)}</h2>
          <p className="text-xs text-muted-foreground">Disponible pour vos achats de numéros</p>
          <button onClick={() => setLocation("/wallet")} className="mt-3 px-4 py-2 bg-primary/20 border border-primary/30 text-primary font-semibold text-xs rounded-xl hover:bg-primary/30 transition-colors">
            + Recharger le portefeuille
          </button>
        </div>

        {/* Methods list */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Mes méthodes ({methods.length})</h3>
          <div className="space-y-3">
            {methods.map((m) => (
              <motion.div key={m.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-card-border rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0" style={{ background: `${m.color}22`, color: m.color }}>
                    {m.abbr}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground">{m.operator}</p>
                      {m.isDefault && (
                        <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                          <Star className="w-2.5 h-2.5" /> Par défaut
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{m.phone}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">Dernier usage : {m.lastUsed}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {!m.isDefault && (
                      <button onClick={() => handleDefault(m.id)} title="Définir par défaut" className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors">
                        <Star className="w-3.5 h-3.5 text-primary" />
                      </button>
                    )}
                    <button onClick={() => handleDelete(m.id)} title="Supprimer" className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {methods.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center">
            <CreditCard className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">Aucune méthode de paiement</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Ajoutez votre Orange Money, MTN ou Wave</p>
          </div>
        )}

        {/* Add new button */}
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-card-border rounded-2xl text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter une méthode de paiement
        </button>

        {/* Info */}
        <div className="flex items-start gap-3 p-4 bg-card border border-card-border rounded-2xl">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Vos méthodes de paiement sont utilisées pour recharger votre portefeuille Simix. Aucune carte bancaire requise — 100% Mobile Money.
          </p>
        </div>
      </motion.div>

      {/* Add modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-background border-t border-card-border rounded-t-3xl p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-foreground">Ajouter une méthode</h3>
                <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <X className="w-4 h-4 text-foreground" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Opérateur</label>
                  <select value={newOp} onChange={(e) => setNewOp(e.target.value)} className="w-full bg-card border border-card-border rounded-2xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary">
                    {OPERATORS.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Numéro de téléphone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+225 07 00 00 00" className="w-full bg-card border border-card-border rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Libellé (optionnel)</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex : Mon Orange Money principal" className="w-full bg-card border border-card-border rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
                <button onClick={handleAdd} className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-2xl transition-colors">
                  Ajouter la méthode
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
