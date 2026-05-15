import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Home, ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center max-w-xs"
      >
        <div className="w-20 h-20 rounded-3xl bg-card border border-card-border flex items-center justify-center mb-6 shadow-lg">
          <SearchX className="w-9 h-9 text-muted-foreground" />
        </div>
        <h1 className="text-5xl font-black text-foreground mb-2">404</h1>
        <p className="text-base font-semibold text-foreground mb-2">Page introuvable</p>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          La page que vous recherchez n'existe pas ou a été déplacée.
        </p>
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-primary/25 hover:opacity-90 transition-opacity"
          >
            <Home className="w-4 h-4" />
            Retour à l'accueil
          </button>
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation("/dashboard"); }}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-card border border-card-border text-foreground text-sm font-medium hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Page précédente
          </button>
        </div>
      </motion.div>
    </div>
  );
}
