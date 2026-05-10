/**
 * Public config endpoint — returns non-sensitive platform settings
 * that the frontend can display (social links, platform name, legal info, etc.)
 * No authentication required.
 */

import { Router } from "express";
import { getSetting } from "../lib/settings";

const router = Router();

router.get("/config", async (_req, res): Promise<void> => {
  const [
    platformName,
    supportEmail,
    supportPhone,
    supportWhatsapp,
    socialTelegramUrl,
    socialWhatsappUrl,
    socialFacebookUrl,
    /* Section 1 — Éditeur */
    legalCompanyName,
    legalCompanyForm,
    legalCompanyCapital,
    legalCompanyAddress,
    legalCompanyRccm,
    legalCompanyTax,
    legalCompanyDirector,
    /* Section 3 — Hébergement */
    legalHostingProvider,
    legalHostingAddress,
    legalHostingRegion,
    legalHostingInfra,
  ] = await Promise.all([
    getSetting("platform_name", "Simix"),
    getSetting("support_email", "support@simix.app"),
    getSetting("support_phone", ""),
    getSetting("support_whatsapp", ""),
    getSetting("social_telegram_url", ""),
    getSetting("social_whatsapp_url", ""),
    getSetting("social_facebook_url", ""),
    getSetting("legal_company_name", ""),
    getSetting("legal_company_form", "Société à Responsabilité Limitée (SARL)"),
    getSetting("legal_company_capital", "5 000 000 FCFA"),
    getSetting("legal_company_address", "Abidjan, Plateau, Côte d'Ivoire"),
    getSetting("legal_company_rccm", ""),
    getSetting("legal_company_tax", ""),
    getSetting("legal_company_director", ""),
    getSetting("legal_hosting_provider", "Supabase Inc."),
    getSetting("legal_hosting_address", "970 Toa Payoh North, Singapour"),
    getSetting("legal_hosting_region", "Europe de l'Ouest (AWS eu-west-1)"),
    getSetting("legal_hosting_infra", "Amazon Web Services (AWS)"),
  ]);

  res.json({
    platformName,
    supportEmail,
    supportPhone,
    supportWhatsapp,
    social: {
      telegram: socialTelegramUrl,
      whatsapp: socialWhatsappUrl,
      facebook: socialFacebookUrl,
    },
    legal: {
      companyName: legalCompanyName,
      companyForm: legalCompanyForm,
      companyCapital: legalCompanyCapital,
      companyAddress: legalCompanyAddress,
      companyRccm: legalCompanyRccm,
      companyTax: legalCompanyTax,
      companyDirector: legalCompanyDirector,
      hostingProvider: legalHostingProvider,
      hostingAddress: legalHostingAddress,
      hostingRegion: legalHostingRegion,
      hostingInfra: legalHostingInfra,
    },
  });
});

export default router;
