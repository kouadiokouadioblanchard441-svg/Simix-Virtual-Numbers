import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
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
  ChevronRight,
} from "lucide-react";
import { SimixLogo } from "@/components/simix-logo";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/orders", label: "Commandes", icon: ShoppingBag },
  { href: "/admin/transactions", label: "Transactions", icon: CreditCard },
  { href: "/admin/services", label: "Services & Prix", icon: Globe },
  { href: "/admin/providers", label: "Fournisseurs API", icon: Zap },
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
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group",
        isActive
          ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
      )}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span>{label}</span>
        {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
      </div>
    </Link>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: user } = useGetMe();

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-zinc-800">
        <SimixLogo size={28} />
        <div>
          <div className="text-white font-bold text-sm leading-none">Simix</div>
          <div className="text-violet-400 text-xs mt-0.5">Admin Panel</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} onClick={() => setSidebarOpen(false)} />
        ))}
      </nav>

      <div className="p-3 border-t border-zinc-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/50">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.fullName?.[0] ?? "A"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">{user?.fullName}</div>
            <div className="text-violet-400 text-xs">Administrateur</div>
          </div>
          <Link href="/dashboard">
            <LogOut className="w-4 h-4 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer" />
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 border-r border-zinc-800 bg-zinc-900 flex-shrink-0 sticky top-0 h-screen">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-56 bg-zinc-900 border-r border-zinc-800 h-full">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-zinc-950/80 backdrop-blur border-b border-zinc-800">
          <button
            className="lg:hidden p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1 text-sm text-zinc-400 hidden sm:block">
            <span className="text-white font-semibold">Admin Panel</span>
            <span className="mx-2 text-zinc-700">/</span>
            <span>Simix Platform</span>
          </div>
          <Link href="/dashboard">
            <span className="text-xs text-violet-400 hover:text-violet-300 transition-colors cursor-pointer">← App</span>
          </Link>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
