import { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

interface AppLayoutProps {
  children: ReactNode;
  showBottomNav?: boolean;
}

export function AppLayout({ children, showBottomNav = true }: AppLayoutProps) {
  return (
    <div className="flex flex-col min-h-[100dvh] w-full bg-background pb-safe relative">
      <main className={`flex-1 flex flex-col ${showBottomNav ? 'pb-24' : ''}`}>
        {children}
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  );
}
