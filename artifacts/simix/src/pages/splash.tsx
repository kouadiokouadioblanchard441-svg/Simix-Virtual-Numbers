import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { SimixLogo } from "@/components/simix-logo";
import phone3d from "@/assets/simix_phone_3d.png";

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
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-primary/20 blur-[100px] rounded-full pointer-events-none" />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center z-10 w-full px-6 mt-12"
      >
        <SimixLogo size={48} />
        
        <div className="flex gap-1 mt-3">
          <span className="text-white text-base font-medium">Numéros virtuels.</span>
          <span className="text-violet-400 text-base font-medium">Paiements simples.</span>
        </div>

        <div className="mt-12 mb-8 relative w-full max-w-[280px] aspect-square flex items-center justify-center">
          <img 
            src={phone3d} 
            alt="Simix App 3D" 
            className="w-full h-full object-contain drop-shadow-2xl"
          />
        </div>
        
        <div className="text-center mt-4">
          <p className="text-white text-base leading-relaxed">
            Recevez des SMS en ligne<br/>rapidement et en toute<br/><span className="text-violet-400">sécurité.</span>
          </p>
        </div>
      </motion.div>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-48 z-10 flex flex-col items-center">
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-3">
          <motion.div 
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.8, ease: "easeInOut" }}
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
          />
        </div>
        <span className="text-xs text-muted-foreground font-medium">Chargement...</span>
      </div>
    </div>
  );
}
