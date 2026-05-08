import { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

interface AppLayoutProps {
  children: ReactNode;
  showBottomNav?: boolean;
}

export function AppLayout({ children, showBottomNav = true }: AppLayoutProps) {
  return (
    <div className="min-h-[100dvh] w-full bg-background flex justify-center">
      <div className="w-full max-w-md flex flex-col min-h-[100dvh] relative">
        <main className={`flex-1 flex flex-col ${showBottomNav ? "pb-24" : ""}`}>
          {children}
        </main>
        {showBottomNav && <BottomNav />}
      </div>
    </div>
  );
}
