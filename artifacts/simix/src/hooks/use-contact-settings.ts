import { useQuery } from "@tanstack/react-query";

interface LegalInfo {
  companyName: string;
  companyForm: string;
  companyCapital: string;
  companyAddress: string;
  companyRccm: string;
  companyTax: string;
  companyDirector: string;
  hostingProvider: string;
  hostingAddress: string;
  hostingRegion: string;
  hostingInfra: string;
}

interface SiteConfig {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  supportWhatsapp: string;
  legal: LegalInfo;
}

async function fetchConfig(): Promise<SiteConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to load config");
  const data = await res.json();
  return {
    platformName: data.platformName ?? "Simix",
    supportEmail: data.supportEmail ?? "support@simix.app",
    supportPhone: data.supportPhone ?? "",
    supportWhatsapp: data.supportWhatsapp ?? "",
    legal: {
      companyName: data.legal?.companyName ?? "",
      companyForm: data.legal?.companyForm ?? "Société à Responsabilité Limitée (SARL)",
      companyCapital: data.legal?.companyCapital ?? "5 000 000 FCFA",
      companyAddress: data.legal?.companyAddress ?? "Abidjan, Plateau, Côte d'Ivoire",
      companyRccm: data.legal?.companyRccm ?? "",
      companyTax: data.legal?.companyTax ?? "",
      companyDirector: data.legal?.companyDirector ?? "",
      hostingProvider: data.legal?.hostingProvider ?? "Supabase Inc.",
      hostingAddress: data.legal?.hostingAddress ?? "970 Toa Payoh North, Singapour",
      hostingRegion: data.legal?.hostingRegion ?? "Europe de l'Ouest (AWS eu-west-1)",
      hostingInfra: data.legal?.hostingInfra ?? "Amazon Web Services (AWS)",
    },
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
    legal: data?.legal ?? {
      companyName: "",
      companyForm: "Société à Responsabilité Limitée (SARL)",
      companyCapital: "5 000 000 FCFA",
      companyAddress: "Abidjan, Plateau, Côte d'Ivoire",
      companyRccm: "",
      companyTax: "",
      companyDirector: "",
      hostingProvider: "Supabase Inc.",
      hostingAddress: "970 Toa Payoh North, Singapour",
      hostingRegion: "Europe de l'Ouest (AWS eu-west-1)",
      hostingInfra: "Amazon Web Services (AWS)",
    },
    isLoading,
  };
}
