import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { motion } from "framer-motion";

export default function Splash() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe();

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      if (user) {
        setLocation("/dashboard");
      } else {
        setLocation("/login");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, isLoading, setLocation]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none" />
      
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center z-10"
      >
        <div className="w-24 h-24 bg-primary/20 rounded-3xl flex items-center justify-center mb-6 relative">
          <div className="absolute inset-0 rounded-3xl border border-primary/30" />
          <div className="w-12 h-12 bg-primary rounded-xl shadow-lg shadow-primary/50" />
        </div>
        
        <h1 className="text-4xl font-bold text-foreground tracking-tight mb-2">Simix</h1>
        <p className="text-muted-foreground text-sm font-medium">Votre portefeuille virtuel</p>
      </motion.div>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-48 z-10 flex flex-col items-center">
        <span className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-semibold">Chargement...</span>
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.8, ease: "easeInOut" }}
            className="h-full bg-primary rounded-full"
          />
        </div>
      </div>
    </div>
  );
}
