import { Link, useLocation } from "wouter";
import { Home, Clock, Wallet, User, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { icon: LucideIcon; label: string; href: string };

const LEFT_ITEMS: NavItem[] = [
  { icon: Home, label: "Accueil", href: "/dashboard" },
  { icon: Clock, label: "Historique", href: "/history" },
];

const RIGHT_ITEMS: NavItem[] = [
  { icon: Wallet, label: "Solde", href: "/wallet" },
  { icon: User, label: "Profil", href: "/profile" },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
      )}
    >
      <Icon className={cn("w-5 h-5", active && "fill-primary/20 stroke-2")} />
      <span className={cn("text-[10px] font-medium", active && "font-bold")}>{item.label}</span>
    </Link>
  );
}

export function BottomNav() {
  const [location] = useLocation();
  const isActive = (href: string) =>
    location === href || location.startsWith(`${href}/`);

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-background/90 backdrop-blur-xl border-t border-card-border pb-safe pt-2 px-6 z-50">
      <div className="flex items-center justify-between relative">
        {LEFT_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <div className="relative -top-6 px-2">
          <Link
            href="/services"
            className="flex items-center justify-center w-[52px] h-[52px] rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-primary/30 active:scale-95 transition-transform"
          >
            <Plus className="w-6 h-6 stroke-2" />
          </Link>
        </div>

        {RIGHT_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>
    </div>
  );
}
