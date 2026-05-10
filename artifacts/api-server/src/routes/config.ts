/**
 * Public config endpoint — returns non-sensitive platform settings
 * that the frontend can display (social links, platform name, etc.)
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
  ] = await Promise.all([
    getSetting("platform_name", "Simix"),
    getSetting("support_email", "support@simix.app"),
    getSetting("support_phone", ""),
    getSetting("support_whatsapp", ""),
    getSetting("social_telegram_url", ""),
    getSetting("social_whatsapp_url", ""),
    getSetting("social_facebook_url", ""),
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
  });
});

export default router;
