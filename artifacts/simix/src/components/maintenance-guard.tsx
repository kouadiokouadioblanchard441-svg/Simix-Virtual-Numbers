import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MaintenancePage from "@/pages/maintenance";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchMaintenanceStatus(): Promise<{ active: boolean }> {
  try {
    const res = await fetch(`${BASE}/api/maintenance/status`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return { active: false };
    return res.json();
  } catch {
    return { active: false };
  }
}

async function fetchMe(): Promise<{ isAdmin?: boolean } | null> {
  try {
    const res = await fetch(`${BASE}/api/auth/me`, { credentials: "include" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  const { data: status } = useQuery({
    queryKey: ["maintenance-status"],
    queryFn: fetchMaintenanceStatus,
    refetchInterval: 15_000,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const { data: me, isFetched: meFetched } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 30_000,
    retry: false,
  });

  const isAdminPath =
    location.startsWith("/admin") ||
    location === "/console" ||
    location === "/admin-login";

  const isAdmin = me?.isAdmin === true;
  const maintenanceActive = status?.active === true;

  /* Auto-redirect away from /maintenance when maintenance is lifted */
  useEffect(() => {
    if (!status) return;
    if (location !== "/maintenance") return;
    if (!status.active) {
      setLocation("/");
    }
  }, [status, location, setLocation]);

  /* Block non-admin users during maintenance.
   * We render the maintenance page IN PLACE (no redirect) so:
   *  - No flash of real content before the redirect
   *  - Works even when the service worker serves a cached SPA shell
   *  - Admin paths remain accessible — admins see the real page
   *
   * NOTE: we block even before `meFetched` is true (i.e. while the /me
   * request is still in flight). This prevents a brief flash of the real
   * page content (especially the landing/vitrine) while we wait to learn
   * whether the visitor is an admin. Once we confirm they are admin we
   * let them through; until then the maintenance screen stays. */
  if (maintenanceActive && !isAdminPath && (!meFetched || !isAdmin)) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}
