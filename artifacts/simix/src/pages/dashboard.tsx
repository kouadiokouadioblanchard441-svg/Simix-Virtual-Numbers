import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useListPopularServices, getListPopularServicesQueryKey, useListPopularCountries, getListPopularCountriesQueryKey } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { motion } from "framer-motion";
import { Bell, Plus, ShieldCheck, Zap, Globe, Clock, ChevronRight, Eye, ShoppingBag, Phone, MessageCircle, FileText } from "lucide-react";
import { Link } from "wouter";
import { SimixLogo } from "@/components/simix-logo";
import phoneChat3d from "@/assets/simix_phone_chat_3d.png";
import { FaWhatsapp, FaTelegram, FaFacebook, FaGoogle, FaInstagram } from "react-icons/fa";
import { SiX } from "react-icons/si";

export default function Dashboard() {
  return (
    <AuthGuard>
      <AppLayout>
        <DashboardContent />
      </AppLayout>
    </AuthGuard>
  );
}

function getServiceIcon(name: string) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("whatsapp")) return <FaWhatsapp className="w-6 h-6 text-white" />;
  if (lowerName.includes("telegram")) return <FaTelegram className="w-6 h-6 text-white" />;
  if (lowerName.includes("facebook")) return <FaFacebook className="w-6 h-6 text-white" />;
  if (lowerName.includes("google")) return <FaGoogle className="w-6 h-6 text-white" />;
  if (lowerName.includes("instagram")) return <FaInstagram className="w-6 h-6 text-white" />;
  if (lowerName.includes("twitter") || lowerName.includes("x")) return <SiX className="w-5 h-5 text-white" />;
  return <span className="text-white font-bold text-lg">{name.charAt(0)}</span>;
}

function DashboardContent() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: popularServices, isLoading: loadingServices } = useListPopularServices({ query: { queryKey: getListPopularServicesQueryKey() } });
  const { data: popularCountries, isLoading: loadingCountries } = useListPopularCountries({ query: { queryKey: getListPopularCountriesQueryKey() } });

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pt-6 pb-24 px-5">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
      
      <div className="relative z-10 flex justify-between items-center mb-8">
        <div>
          <SimixLogo size={24} />
          <p className="text-xs text-muted-foreground mt-1">Numéros virtuels. Paiements simples.</p>
        </div>
        <button className="w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center text-foreground relative hover:bg-secondary transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2.5 w-2.5 h-2.5 bg-primary border-2 border-card rounded-full" />
        </button>
      </div>

      {/* Hero Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="w-full bg-gradient-to-br from-violet-700 to-violet-900 rounded-3xl p-6 mb-4 relative overflow-hidden shadow-xl"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
        
        <div className="relative z-10 flex">
          <div className="flex-1 pr-4">
            <h2 className="text-2xl font-bold text-white leading-tight mb-2">
              Votre numéro<br/>virtuel en quelques<br/><span className="text-violet-300 underline decoration-violet-400/50 underline-offset-4">secondes</span>
            </h2>
            <p className="text-sm text-violet-200 mb-6 leading-relaxed max-w-[200px]">
              Recevez des SMS en ligne rapidement et en toute sécurité.
            </p>
            <Link href="/services" className="inline-flex h-10 items-center justify-center bg-white text-violet-900 px-4 rounded-full text-sm font-bold shadow-lg hover:bg-violet-50 transition-colors">
              <FileText className="w-4 h-4 mr-2" /> Acheter un numéro →
            </Link>
          </div>
          <div className="absolute -right-6 bottom-0 w-40 h-40">
            <img src={phoneChat3d} alt="Phone 3D" className="w-full h-full object-contain" />
          </div>
        </div>
      </motion.div>

      {/* Balance Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="w-full bg-card rounded-2xl p-5 flex items-center justify-between border border-card-border mb-8 shadow-sm"
      >
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-1">Solde actuel</p>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-foreground">
              {loadingSummary ? "..." : formatFCFA(summary?.balance || 0)}
            </h3>
            <Eye className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
        <Link href="/wallet" className="h-10 bg-primary/10 hover:bg-primary/20 text-primary px-4 rounded-full text-sm font-bold flex items-center gap-1 transition-colors border border-primary/20">
          <Plus className="w-4 h-4" /> Recharger
        </Link>
      </motion.div>

      {/* How it works */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
        <h2 className="text-lg font-bold text-foreground mb-4">Comment ça fonctionne ?</h2>
        <div className="grid grid-cols-4 gap-2 relative">
          {/* Connecting arrows could be absolutely positioned or just simple Chevrons between items, but the prompt says ">" icons between them. Let's do a flex row instead of grid for easier arrows. */}
          <div className="col-span-4 flex justify-between items-start gap-1">
            <div className="flex-1 bg-card rounded-2xl border border-card-border p-3 flex flex-col items-center text-center relative z-10">
              <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center mb-2 text-violet-500">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-violet-500 mb-1">01</span>
              <p className="text-[10px] font-medium text-foreground leading-tight">Choisissez un service</p>
            </div>
            <div className="flex items-center justify-center text-muted-foreground/30 pt-6">
              <ChevronRight className="w-4 h-4" />
            </div>
            <div className="flex-1 bg-card rounded-2xl border border-card-border p-3 flex flex-col items-center text-center relative z-10">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-2 text-blue-500">
                <Phone className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-blue-500 mb-1">02</span>
              <p className="text-[10px] font-medium text-foreground leading-tight">Obtenez un numéro</p>
            </div>
            <div className="flex items-center justify-center text-muted-foreground/30 pt-6">
              <ChevronRight className="w-4 h-4" />
            </div>
            <div className="flex-1 bg-card rounded-2xl border border-card-border p-3 flex flex-col items-center text-center relative z-10">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-2 text-green-500">
                <MessageCircle className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-green-500 mb-1">03</span>
              <p className="text-[10px] font-medium text-foreground leading-tight">Recevez le SMS</p>
            </div>
            <div className="flex items-center justify-center text-muted-foreground/30 pt-6">
              <ChevronRight className="w-4 h-4" />
            </div>
            <div className="flex-1 bg-card rounded-2xl border border-card-border p-3 flex flex-col items-center text-center relative z-10">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-2 text-amber-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-amber-500 mb-1">04</span>
              <p className="text-[10px] font-medium text-foreground leading-tight">Utilisez le code</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Popular Services */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mb-8">
        <div className="flex justify-between items-end mb-4">
          <h2 className="text-lg font-bold text-foreground">Services populaires</h2>
          <Link href="/services" className="text-sm font-medium text-primary hover:underline">
            Voir tout
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {loadingServices ? (
             Array.from({length: 6}).map((_, i) => (
              <div key={i} className="h-16 bg-card border border-card-border rounded-2xl animate-pulse" />
            ))
          ) : (
            popularServices?.slice(0, 6).map(service => (
              <Link key={service.id} href={`/countries?serviceId=${service.id}`} className="flex items-center gap-3 bg-card border border-card-border p-3 rounded-2xl hover:bg-secondary/50 transition-colors">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0" style={{ backgroundColor: service.color || '#3b82f6' }}>
                   {getServiceIcon(service.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{service.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{service.scope || "Global"}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-primary">{service.price} FCFA</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </motion.div>

      {/* Popular Countries */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <div className="flex justify-between items-end mb-4">
          <h2 className="text-lg font-bold text-foreground">Pays populaires</h2>
          <Link href="/countries" className="text-sm font-medium text-primary hover:underline">
            Voir tout
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x hide-scrollbar -mx-5 px-5">
          {loadingCountries ? (
             Array.from({length: 5}).map((_, i) => (
              <div key={i} className="min-w-[100px] h-28 bg-card border border-card-border rounded-2xl animate-pulse snap-start" />
            ))
          ) : (
            popularCountries?.slice(0, 5).map(country => (
              <Link key={country.id} href={`/services?countryId=${country.id}`} className="min-w-[100px] bg-card border border-card-border p-4 rounded-2xl flex flex-col items-center justify-center gap-2 snap-start hover:bg-secondary/50 transition-colors">
                <span className="text-3xl">{country.flag}</span>
                <span className="text-xs font-bold text-foreground truncate w-full text-center">{country.name}</span>
                <span className="text-xs font-medium text-violet-400">{country.dialCode}</span>
              </Link>
            ))
          )}
        </div>
      </motion.div>

    </div>
  );
}
