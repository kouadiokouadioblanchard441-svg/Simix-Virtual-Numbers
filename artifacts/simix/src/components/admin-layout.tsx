import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { adminToken } from "@/lib/admin-token";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Settings,
  Shield,
  Zap,
  LogOut,
  Menu,
  X,
  Globe,
  FileText,
  CreditCard,
  ArrowUpRight,
  MapPin,
  BarChart3,
  MessageSquare,
  Bell,
  Mail,
} from "lucide-react";
import { SimixLogo } from "@/components/simix-logo";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytiques", icon: BarChart3 },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/orders", label: "Commandes", icon: ShoppingBag },
  { href: "/admin/transactions", label: "Transactions", icon: CreditCard },
  { href: "/admin/services", label: "Services & Prix", icon: Globe },
  { href: "/admin/payment-config", label: "Paiements / Pays", icon: MapPin },
  { href: "/admin/providers", label: "Fournisseurs API", icon: Zap },
  { href: "/admin/support", label: "Support IA", icon: MessageSquare },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/emails", label: "Campagnes Email", icon: Mail },
  { href: "/admin/footer", label: "Footer & Vitrine", icon: Globe },
  { href: "/admin/security", label: "Sécurité", icon: Shield },
  { href: "/admin/logs", label: "Journaux", icon: FileText },
  { href: "/admin/settings", label: "Paramètres", icon: Settings },
];

function NavLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: React.ElementType; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/admin" && location.startsWith(href));

  return (
    <Link href={href} onClick={onClick}>
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer",
        isActive
          ? "bg-violet-600/90 text-white shadow-md shadow-violet-500/25"
          : "text-zinc-400 hover:text-white hover:bg-zinc-800/70"
      )}>
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
          isActive ? "bg-white/15" : "bg-zinc-800/60 group-hover:bg-zinc-700"
        )}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="truncate">{label}</span>
        {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />}
      </div>
    </Link>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function secureLogout() {
  const token = adminToken.get();
  if (token) {
    await fetch(`${BASE}/api/admin-auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  adminToken.clear();
  sessionStorage.removeItem("simix_admin_access_granted");
  window.location.href = BASE + "/login";
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { data: user } = useGetMe();
  const secsRemaining = adminToken.getSecondsRemaining();
  const hoursLeft = Math.floor(secsRemaining / 3600);
  const minsLeft = Math.floor((secsRemaining % 3600) / 60);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-zinc-800/80">
        <SimixLogo size={30} />
        <div className="text-violet-400 text-[11px] font-semibold tracking-widest uppercase border border-violet-500/30 bg-violet-500/10 rounded-md px-2 py-0.5">
          Admin
        </div>
      </div>

      <div className="px-3 pt-4 pb-1">
        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-1 mb-1.5">Navigation</p>
      </div>

      <nav className="flex-1 px-3 pb-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} onClick={onClose} />
        ))}
      </nav>

      <div className="p-3 border-t border-zinc-800/80 space-y-2">
        <Link href="/dashboard" onClick={onClose}>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/70 transition-all cursor-pointer text-sm font-medium">
            <div className="w-7 h-7 rounded-lg bg-zinc-800/60 flex items-center justify-center flex-shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
            <span>Retour à l'app</span>
          </div>
        </Link>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-800/40 border border-zinc-800/80">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
            {user?.fullName?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">{user?.fullName}</div>
            <div className="text-emerald-400 text-[10px]">
              {secsRemaining > 0 ? `Session: ${hoursLeft}h${minsLeft}m` : "Administrateur"}
            </div>
          </div>
          <button onClick={() => { onClose?.(); void secureLogout(); }} title="Déconnexion sécurisée">
            <LogOut className="w-4 h-4 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();

  const currentPage = NAV_ITEMS.find(item =>
    item.href === location || (item.href !== "/admin" && location.startsWith(item.href))
  );

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 border-r border-zinc-800/80 bg-zinc-900/60 flex-shrink-0 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-10 w-60 bg-zinc-900 border-r border-zinc-800/80 h-full shadow-2xl">
            <SidebarContent onClose={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80">
          <button
            className="lg:hidden w-9 h-9 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 transition-colors flex items-center justify-center"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-zinc-500 hidden sm:inline">Admin</span>
              {currentPage && (
                <>
                  <span className="text-zinc-700 hidden sm:inline">/</span>
                  <span className="text-white font-semibold">{currentPage.label}</span>
                </>
              )}
            </div>
          </div>

          <Link href="/dashboard">
            <div className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors cursor-pointer bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 px-3 py-1.5 rounded-lg font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Retour à l'app</span>
            </div>
          </Link>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
