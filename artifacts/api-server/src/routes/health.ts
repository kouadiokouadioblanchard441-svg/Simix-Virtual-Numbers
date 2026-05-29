import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/* ─── GET /public/registration-countries
 * Public endpoint — returns countries with enabled=true for the registration dial-code picker.
 * ─────────────────────────────────────────────────────────────────── */
router.get("/public/registration-countries", async (_req, res): Promise<void> => {
  try {
    const { rows } = await pool.query<{
      code: string; dial_code: string; name: string; flag: string;
    }>(
      `SELECT code, dial_code, name, flag FROM countries WHERE enabled = true ORDER BY sort_order ASC`
    );
    res.json(rows.map(r => ({
      code: r.code.toLowerCase(),
      dial: r.dial_code,
      label: r.name,
      flag: r.flag,
    })));
  } catch {
    res.status(500).json({ error: "Impossible de charger les pays." });
  }
});

export default router;
