import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchMaintenanceStatus(): Promise<{ active: boolean }> {
  const res = await fetch(`${BASE}/api/maintenance/status`);
  if (!res.ok) return { active: false };
  return res.json();
}

async function fetchMe(): Promise<{ isAdmin?: boolean } | null> {
  const res = await fetch(`${BASE}/api/auth/me`, { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  const { data: status } = useQuery({
    queryKey: ["maintenance-status"],
    queryFn: fetchMaintenanceStatus,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  /* Re-use the same cache key as the rest of the app so we don't fire
     a duplicate /api/auth/me request.  isFetched tells us when the
     first response (success OR error) has arrived. */
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

  const isMaintenancePage = location === "/maintenance";
  const isAdmin = me?.isAdmin === true;

  /* Redirect to /maintenance — but only after we know if user is admin */
  useEffect(() => {
    if (!status) return;           // status not yet loaded
    if (!meFetched) return;        // wait for auth check before deciding
    if (isMaintenancePage) return;
    if (isAdminPath) return;
    if (isAdmin) return;
    if (status.active) {
      setLocation("/maintenance");
    }
  }, [status, meFetched, isAdmin, isAdminPath, isMaintenancePage, setLocation]);

  /* Auto-redirect away from /maintenance when maintenance is lifted */
  useEffect(() => {
    if (!status) return;
    if (!isMaintenancePage) return;
    if (!status.active) {
      setLocation("/");
    }
  }, [status, isMaintenancePage, setLocation]);

  return <>{children}</>;
}
