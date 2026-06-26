import { Link, useLocation } from "wouter";
import { Home, Bell, Wallet, User, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";
import { useGetMe } from "@workspace/api-client-react";

type NavItem = { icon: LucideIcon; label: string; href: string };

const LEFT_ITEMS: NavItem[] = [
  { icon: Home, label: "Accueil", href: "/dashboard" },
  { icon: Bell, label: "Alertes", href: "/notifications" },
];

const RIGHT_ITEMS: NavItem[] = [
  { icon: Wallet, label: "Solde", href: "/wallet" },
  { icon: User, label: "Profil", href: "/profile" },
];

function NavLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="flex-1">
      <div className={cn(
        "flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}>
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-all relative",
          active ? "bg-primary/10" : "hover:bg-secondary/60",
        )}>
          <Icon className={cn("w-5 h-5 transition-all", active ? "stroke-[2.5]" : "stroke-[1.8]")} />
          {badge != null && badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-red-500 border-2 border-card rounded-full text-[8px] font-bold text-white flex items-center justify-center px-0.5">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
        <span className={cn(
          "text-[10px] font-medium leading-none tracking-tight",
          active ? "font-bold text-primary" : "text-muted-foreground",
        )}>
          {item.label}
        </span>
      </div>
    </Link>
  );
}

export function BottomNav() {
  const [location] = useLocation();
  const { data: me } = useGetMe({ query: { enabled: true } });
  const { unreadCount } = useNotifications(!!me);

  const isActive = (href: string) =>
    location === href || location.startsWith(`${href}/`);

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 pb-safe">
      <div className="mx-3 mb-3 bg-card/95 backdrop-blur-xl border border-card-border rounded-2xl shadow-xl shadow-black/20">
        <div className="flex items-center px-2 py-1">
          {LEFT_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              badge={item.href === "/notifications" ? unreadCount : undefined}
            />
          ))}

          {/* Center Action Button */}
          <div className="flex-1 flex justify-center py-1">
            <Link href="/services">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/35 active:scale-95 transition-transform">
                <Plus className="w-6 h-6 text-white stroke-[2.5]" />
              </div>
            </Link>
          </div>

          {RIGHT_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </div>
    </div>
  );
}
