/**
 * Public maintenance status + page config endpoint — no auth required.
 * Used by the frontend to check if maintenance mode is active
 * and to get the customisable text shown on the maintenance page.
 */
import { Router } from "express";
import { getSetting } from "../lib/settings";

const router = Router();

router.get("/maintenance/status", async (_req, res): Promise<void> => {
  const [mode, title, subtitle, estimatedTime, contactEmail, buttonText] =
    await Promise.all([
      getSetting("maintenance_mode",        "false"),
      getSetting("maintenance_title",       "Le site est actuellement en maintenance."),
      getSetting("maintenance_subtitle",    "Nous travaillons à améliorer votre expérience. Veuillez réessayer dans quelques instants."),
      getSetting("maintenance_estimated_time", "Bientôt disponible"),
      getSetting("maintenance_contact_email",  "simixsupport@gmail.com"),
      getSetting("maintenance_button_text", "Réessayer plus tard"),
    ]);

  const active = mode === "true" || mode === "1";

  res.json({ active, title, subtitle, estimatedTime, contactEmail, buttonText });
});

export default router;
