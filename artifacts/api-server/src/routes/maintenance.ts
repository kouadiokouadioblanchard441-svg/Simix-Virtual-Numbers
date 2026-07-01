/**
 * Public maintenance status endpoint — no auth required.
 * Used by the frontend to check if maintenance mode is active
 * and redirect non-admin users to the maintenance page.
 */
import { Router } from "express";
import { getSetting } from "../lib/settings";

const router = Router();

router.get("/maintenance/status", async (_req, res): Promise<void> => {
  const value = await getSetting("maintenance_mode", "false");
  const active = value === "true" || value === "1";
  res.json({ active });
});

export default router;
