import { useQuery } from "@tanstack/react-query";

interface ContactSettings {
  supportEmail: string;
  supportPhone: string;
  supportWhatsapp: string;
  platformName: string;
}

async function fetchConfig(): Promise<ContactSettings> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to load config");
  const data = await res.json();
  return {
    platformName: data.platformName ?? "Simix",
    supportEmail: data.supportEmail ?? "support@simix.app",
    supportPhone: data.supportPhone ?? "",
    supportWhatsapp: data.supportWhatsapp ?? "",
  };
}

export function useContactSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ["contact-settings"],
    queryFn: fetchConfig,
    staleTime: 5 * 60 * 1000,
  });
  return {
    supportEmail: data?.supportEmail ?? "support@simix.app",
    supportPhone: data?.supportPhone ?? "",
    supportWhatsapp: data?.supportWhatsapp ?? "",
    platformName: data?.platformName ?? "Simix",
    isLoading,
  };
}
