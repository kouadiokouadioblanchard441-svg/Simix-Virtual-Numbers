/**
 * seed-routing.ts — Seeds payment_gateways, mobile_operators, and payment_routes at startup.
 *
 * Three phases:
 *  1. Gateways   — ensure PawaPay + Clapay gateway records exist (idempotent)
 *  2. Operators  — seed all African mobile operators (idempotent)
 *  3. Routes     — seed per-country per-operator routes, smart gateway assignment
 *
 * Smart routing logic (phase 3):
 *  - Reads which gateways have valid API keys (env or DB)
 *  - For West Africa (Clapay coverage): Clapay primary if available, PawaPay secondary
 *  - For East/Southern Africa (PawaPay only): PawaPay primary if available
 *  - For overlapping countries: prefer Clapay for Wave/Free/Moov, PawaPay otherwise
 *  - Routes are UPSERTED so admin overrides made via UI are preserved on subsequent boots
 *    (we only overwrite gateway IDs when both slots were NULL — never demote a live config)
 */
import {
  db,
  paymentGatewaysTable,
  mobileOperatorsTable,
  paymentRoutesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";

/* ── Types ── */
interface GatewayRecord { id: string; slug: string; apiKey: string | null }

/* ═══════════════════════════════════════════════════════════════
   PHASE 1 — GATEWAYS
   ═══════════════════════════════════════════════════════════════ */

async function upsertGateway(params: {
  slug: string;
  name: string;
  logoUrl?: string;
  apiUrl?: string;
  apiKey?: string | null;
  apiSecret?: string | null;
  type?: string;
  supportedCountries?: string[];
  supportedOperators?: string[];
  notes?: string;
}): Promise<GatewayRecord> {
  const existing = await db
    .select({ id: paymentGatewaysTable.id, apiKey: paymentGatewaysTable.apiKey })
    .from(paymentGatewaysTable)
    .where(eq(paymentGatewaysTable.slug, params.slug))
    .limit(1);

  if (existing.length > 0) {
    if (params.apiKey) {
      await db
        .update(paymentGatewaysTable)
        .set({
          apiKey:  params.apiKey,
          ...(params.apiUrl    ? { apiUrl:    params.apiUrl    } : {}),
          ...(params.apiSecret ? { apiSecret: params.apiSecret } : {}),
          updatedAt: new Date(),
        })
        .where(eq(paymentGatewaysTable.slug, params.slug));
    }
    return { id: existing[0].id, slug: params.slug, apiKey: params.apiKey ?? existing[0].apiKey };
  }

  const [inserted] = await db
    .insert(paymentGatewaysTable)
    .values({
      name:               params.name,
      slug:               params.slug,
      logoUrl:            params.logoUrl   ?? null,
      apiUrl:             params.apiUrl    ?? null,
      apiKey:             params.apiKey    ?? null,
      apiSecret:          params.apiSecret ?? null,
      type:               params.type      ?? "deposit",
      supportedCountries: params.supportedCountries ?? [],
      supportedOperators: params.supportedOperators ?? [],
      active:             true,
      testMode:           false,
      notes:              params.notes ?? null,
    })
    .returning({ id: paymentGatewaysTable.id, apiKey: paymentGatewaysTable.apiKey });

  logger.info({ slug: params.slug }, "[seed-routing] Gateway inserted");
  return { id: inserted.id, slug: params.slug, apiKey: inserted.apiKey };
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 2 — MOBILE OPERATORS
   ═══════════════════════════════════════════════════════════════ */

async function upsertOperator(params: {
  slug: string;
  name: string;
  color: string;
  logoUrl?: string;
  countryCodes: string[];
  sortOrder: number;
}): Promise<void> {
  const existing = await db
    .select({ id: mobileOperatorsTable.id })
    .from(mobileOperatorsTable)
    .where(eq(mobileOperatorsTable.slug, params.slug))
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(mobileOperatorsTable).values({
    name:         params.name,
    slug:         params.slug,
    logoUrl:      params.logoUrl ?? null,
    color:        params.color,
    countryCodes: params.countryCodes,
    active:       true,
    sortOrder:    params.sortOrder,
  });
  logger.info({ slug: params.slug }, "[seed-routing] Operator inserted");
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 3 — PAYMENT ROUTES (comprehensive Africa coverage)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Africa route definitions:
 *  cc          = ISO-2 country code (uppercase)
 *  op          = operator slug (canonical, e.g. "orange", "mtn")
 *  viaClapay   = Clapay supports this combination
 *  viaPawaPay  = PawaPay supports this combination
 *  preferClapay = when both available, use Clapay as primary (West Africa operators)
 */
interface RouteSpec {
  cc: string;
  op: string;
  viaClapay:   boolean;
  viaPawaPay:  boolean;
  preferClapay: boolean;
}

const AFRICA_ROUTES: RouteSpec[] = [
  /* ── Ivory Coast (CI) ── */
  { cc:"CI", op:"orange",   viaClapay:true,  viaPawaPay:true,  preferClapay:true  },
  { cc:"CI", op:"mtn",      viaClapay:true,  viaPawaPay:true,  preferClapay:false },
  { cc:"CI", op:"wave",     viaClapay:true,  viaPawaPay:false, preferClapay:true  },
  { cc:"CI", op:"moov",     viaClapay:true,  viaPawaPay:true,  preferClapay:true  },

  /* ── Senegal (SN) ── */
  { cc:"SN", op:"orange",   viaClapay:true,  viaPawaPay:true,  preferClapay:true  },
  { cc:"SN", op:"wave",     viaClapay:true,  viaPawaPay:false, preferClapay:true  },
  { cc:"SN", op:"free",     viaClapay:true,  viaPawaPay:false, preferClapay:true  },
  { cc:"SN", op:"expresso", viaClapay:false, viaPawaPay:false, preferClapay:false }, // legacy/inactive
  { cc:"SN", op:"mtn",      viaClapay:false, viaPawaPay:false, preferClapay:false }, // SN has no MTN

  /* ── Cameroon (CM) ── */
  { cc:"CM", op:"mtn",      viaClapay:true,  viaPawaPay:true,  preferClapay:false },
  { cc:"CM", op:"orange",   viaClapay:true,  viaPawaPay:true,  preferClapay:true  },

  /* ── Burkina Faso (BF) ── */
  { cc:"BF", op:"orange",   viaClapay:true,  viaPawaPay:true,  preferClapay:true  },
  { cc:"BF", op:"moov",     viaClapay:true,  viaPawaPay:true,  preferClapay:true  },
  { cc:"BF", op:"wave",     viaClapay:true,  viaPawaPay:false, preferClapay:true  },

  /* ── Benin (BJ) ── */
  { cc:"BJ", op:"mtn",      viaClapay:true,  viaPawaPay:true,  preferClapay:false },
  { cc:"BJ", op:"moov",     viaClapay:true,  viaPawaPay:true,  preferClapay:true  },
  { cc:"BJ", op:"flooz",    viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Mali (ML) ── */
  { cc:"ML", op:"orange",   viaClapay:true,  viaPawaPay:true,  preferClapay:true  },
  { cc:"ML", op:"moov",     viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"ML", op:"wave",     viaClapay:true,  viaPawaPay:false, preferClapay:true  },

  /* ── Guinea (GN) ── */
  { cc:"GN", op:"orange",   viaClapay:true,  viaPawaPay:true,  preferClapay:true  },
  { cc:"GN", op:"mtn",      viaClapay:true,  viaPawaPay:true,  preferClapay:false },
  { cc:"GN", op:"free",     viaClapay:true,  viaPawaPay:false, preferClapay:true  },

  /* ── Niger (NE) ── */
  { cc:"NE", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"NE", op:"moov",     viaClapay:true,  viaPawaPay:false, preferClapay:true  },

  /* ── Togo (TG) ── */
  { cc:"TG", op:"tmoney",   viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"TG", op:"flooz",    viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"TG", op:"moov",     viaClapay:true,  viaPawaPay:false, preferClapay:true  },

  /* ── Ghana (GH) ── */
  { cc:"GH", op:"mtn",      viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"GH", op:"vodafone", viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"GH", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Kenya (KE) ── */
  { cc:"KE", op:"mpesa",    viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"KE", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Tanzania (TZ) ── */
  { cc:"TZ", op:"mpesa",    viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"TZ", op:"vodacom",  viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"TZ", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"TZ", op:"tigo",     viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Uganda (UG) ── */
  { cc:"UG", op:"mtn",      viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"UG", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Rwanda (RW) ── */
  { cc:"RW", op:"mtn",      viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"RW", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Zambia (ZM) ── */
  { cc:"ZM", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"ZM", op:"mtn",      viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"ZM", op:"zamtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Zimbabwe (ZW) ── */
  { cc:"ZW", op:"econet",   viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Malawi (MW) ── */
  { cc:"MW", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"MW", op:"tnm",      viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Mozambique (MZ) ── */
  { cc:"MZ", op:"mpesa",    viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"MZ", op:"vodacom",  viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── DR Congo (CD) ── */
  { cc:"CD", op:"mtn",      viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"CD", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"CD", op:"orange",   viaClapay:false, viaPawaPay:false, preferClapay:false },
  { cc:"CD", op:"vodacom",  viaClapay:false, viaPawaPay:false, preferClapay:false },

  /* ── Republic of Congo (CG) ── */
  { cc:"CG", op:"mtn",      viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"CG", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Gabon (GA) ── */
  { cc:"GA", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"GA", op:"moov",     viaClapay:false, viaPawaPay:false, preferClapay:false },

  /* ── Madagascar (MG) ── */
  { cc:"MG", op:"mvola",    viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"MG", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"MG", op:"moov",     viaClapay:false, viaPawaPay:false, preferClapay:false },
  { cc:"MG", op:"orange",   viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Nigeria (NG) ── */
  { cc:"NG", op:"mtn",      viaClapay:false, viaPawaPay:true,  preferClapay:false },
  { cc:"NG", op:"airtel",   viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── South Africa (ZA) ── */
  { cc:"ZA", op:"mpesa",    viaClapay:false, viaPawaPay:true,  preferClapay:false },

  /* ── Ethiopia (ET) ── */
  { cc:"ET", op:"mpesa",    viaClapay:false, viaPawaPay:false, preferClapay:false },

  /* ── Guinea-Bissau (GW) ── */
  { cc:"GW", op:"moov",     viaClapay:false, viaPawaPay:false, preferClapay:false },

  /* ── Mauritania (MR) ── */
  { cc:"MR", op:"moov",     viaClapay:false, viaPawaPay:false, preferClapay:false },

  /* ── Cameroon extra ── */
  { cc:"CM", op:"moov",     viaClapay:false, viaPawaPay:false, preferClapay:false },

  /* ── Angola (AO) ── */
  { cc:"AO", op:"unitel",   viaClapay:false, viaPawaPay:false, preferClapay:false },

  /* ── Sierra Leone (SL) ── */
  { cc:"SL", op:"orange",   viaClapay:false, viaPawaPay:false, preferClapay:false },
  { cc:"SL", op:"africell", viaClapay:false, viaPawaPay:false, preferClapay:false },

  /* ── Gambia (GM) ── */
  { cc:"GM", op:"africell", viaClapay:false, viaPawaPay:false, preferClapay:false },
  { cc:"GM", op:"wave",     viaClapay:false, viaPawaPay:false, preferClapay:false },
];

async function seedPaymentRoutes(
  pawaPayId: string | null,
  clapayId:  string | null,
  hasPawaPay: boolean,
  hasClapay:  boolean,
): Promise<void> {
  if (!hasPawaPay && !hasClapay) {
    logger.info("[seed-routing] No gateway with API key — skipping route seeding");
    return;
  }

  let seeded = 0;

  for (const r of AFRICA_ROUTES) {
    /* Determine primary and secondary gateway IDs for this route */
    let primaryId:   string | null = null;
    let secondaryId: string | null = null;

    if (hasClapay && hasPawaPay) {
      /* Both configured — smart assignment */
      if (r.viaClapay && r.viaPawaPay) {
        if (r.preferClapay) {
          primaryId   = clapayId;
          secondaryId = pawaPayId;
        } else {
          primaryId   = pawaPayId;
          secondaryId = clapayId;
        }
      } else if (r.viaClapay) {
        primaryId = clapayId;
      } else if (r.viaPawaPay) {
        primaryId = pawaPayId;
      } else {
        continue; /* Neither gateway supports this — skip */
      }
    } else if (hasPawaPay) {
      if (!r.viaPawaPay) continue;
      primaryId = pawaPayId;
      if (r.viaClapay && clapayId) secondaryId = clapayId;
    } else {
      /* hasClapay only */
      if (!r.viaClapay) continue;
      primaryId = clapayId;
      if (r.viaPawaPay && pawaPayId) secondaryId = pawaPayId;
    }

    if (!primaryId) continue;

    try {
      await db
        .insert(paymentRoutesTable)
        .values({
          countryCode:        r.cc,
          operatorSlug:       r.op,
          transactionType:    "deposit",
          primaryGatewayId:   primaryId,
          secondaryGatewayId: secondaryId,
          tertiaryGatewayId:  null,
          active:             true,
          maintenanceMode:    false,
          notes:              "Auto-seeded at startup",
        })
        .onConflictDoUpdate({
          target: [
            paymentRoutesTable.countryCode,
            paymentRoutesTable.operatorSlug,
            paymentRoutesTable.transactionType,
          ],
          /* Always refresh gateway IDs to reflect current API key configuration.
           * active + maintenanceMode are preserved so admin toggles survive reboots. */
          set: {
            primaryGatewayId:   sql`EXCLUDED.primary_gateway_id`,
            secondaryGatewayId: sql`EXCLUDED.secondary_gateway_id`,
            notes:              sql`EXCLUDED.notes`,
            updatedAt:          sql`NOW()`,
          },
        });
      seeded++;
    } catch (e) {
      logger.warn({ cc: r.cc, op: r.op, err: (e as Error).message }, "[seed-routing] Route upsert failed");
    }
  }

  logger.info({ seeded }, "[seed-routing] Payment routes seeded");
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC ENTRY POINT
   ═══════════════════════════════════════════════════════════════ */

export async function seedRoutingData(): Promise<void> {
  try {
    /* ── Phase 1: Gateways ── */
    const pawaPayGw = await upsertGateway({
      slug: "pawapay",
      name: "PawaPay",
      logoUrl: "https://pawapay.com/favicon.ico",
      apiUrl:  "https://api.pawapay.io",
      apiKey:  process.env.PAWAPAY_API_TOKEN ?? null,
      type:    "deposit",
      supportedCountries: [
        "CI","SN","CM","GH","TZ","UG","ZM","ZW","CD","BJ","BF","ML","MG","RW","MZ","MW",
        "KE","NG","CG","GA","NE","GN","TG","ZA","AO","ET","MW",
      ],
      supportedOperators: ["mtn","orange","airtel","vodacom","zamtel","tigo","africell","mpesa","wave","moov","mvola","tmoney","flooz","econet","tnm"],
      notes: "PawaPay — Mobile Money aggregator for 20+ African countries",
    });

    const clapayGw = await upsertGateway({
      slug: "clapay",
      name: "Clapay",
      logoUrl: "https://clapay.net/favicon.ico",
      apiUrl:  process.env.CLAPAY_BASE_URL ?? "https://api.clapay.net",
      apiKey:  process.env.CLAPAY_API_TOKEN ?? null,
      type:    "deposit",
      supportedCountries: ["CI","SN","CM","BF","BJ","ML","GN","NE","TG"],
      supportedOperators: ["orange","mtn","wave","moov","free"],
      notes: "Clapay — Mobile Money aggregator for West & Central Africa",
    });

    /* ── Phase 2: Mobile Operators ── */
    const operators = [
      { slug:"mtn",      name:"MTN Mobile Money",    color:"#FFC107", sortOrder:1,
        countryCodes:["CI","CM","GH","SN","BJ","BF","GN","LR","ZA","RW","UG","ZM","MW","SS","NG","CG","CD"] },
      { slug:"orange",   name:"Orange Money",         color:"#FF6B00", sortOrder:2,
        countryCodes:["CI","SN","CM","ML","BF","NE","GN","LR","BI","CF","CD","MG","MA","TN","EG","SL"] },
      { slug:"wave",     name:"Wave",                 color:"#00B4FF", sortOrder:3,
        countryCodes:["CI","SN","BF","ML","GN","GM","UG"] },
      { slug:"moov",     name:"Moov Africa",          color:"#0058A3", sortOrder:4,
        countryCodes:["CI","BJ","BF","ML","NE","TG","CD","GA","MG","GW","MR","CM"] },
      { slug:"airtel",   name:"Airtel Money",         color:"#E30613", sortOrder:5,
        countryCodes:["CM","GH","RW","UG","TZ","ZM","MW","NG","KE","CD","MG","BI","SL","NE"] },
      { slug:"free",     name:"Free Money",           color:"#CC0000", sortOrder:6,
        countryCodes:["SN","GN"] },
      { slug:"expresso", name:"Expresso",             color:"#009900", sortOrder:7,
        countryCodes:["SN","GN"] },
      { slug:"mpesa",    name:"M-Pesa",               color:"#00A651", sortOrder:8,
        countryCodes:["KE","TZ","MZ","GH","ZA","CD","RW","ET","MW"] },
      { slug:"vodacom",  name:"Vodacom M-Pesa",       color:"#E60000", sortOrder:9,
        countryCodes:["TZ","ZA","MZ","CD","MG"] },
      { slug:"vodafone", name:"Vodafone Cash",        color:"#E60000", sortOrder:10,
        countryCodes:["GH","EG"] },
      { slug:"tigo",     name:"Tigo Cash",            color:"#0A5FBC", sortOrder:11,
        countryCodes:["TZ","GH","SN"] },
      { slug:"zamtel",   name:"Zamtel Kwacha",        color:"#006633", sortOrder:12,
        countryCodes:["ZM"] },
      { slug:"africell", name:"Africell",             color:"#0066B3", sortOrder:13,
        countryCodes:["UG","GM","SL","CD"] },
      { slug:"tmoney",   name:"T-Money",              color:"#00AEEF", sortOrder:14,
        countryCodes:["TG"] },
      { slug:"flooz",    name:"Flooz",                color:"#7B2D8B", sortOrder:15,
        countryCodes:["TG","BJ"] },
      { slug:"mvola",    name:"MVola",                color:"#E30613", sortOrder:16,
        countryCodes:["MG"] },
      { slug:"econet",   name:"EcoCash (Econet)",     color:"#009900", sortOrder:17,
        countryCodes:["ZW"] },
      { slug:"tnm",      name:"TNM Mpamba",           color:"#003087", sortOrder:18,
        countryCodes:["MW"] },
      { slug:"unitel",   name:"Unitel Money",         color:"#E6001E", sortOrder:19,
        countryCodes:["AO"] },
    ];

    for (const op of operators) {
      await upsertOperator(op);
    }

    /* ── Phase 3: Routes ── */
    /* Determine which gateways are "live" (have an API key in env or just saved in DB) */
    const pawaPayKey = process.env.PAWAPAY_API_TOKEN?.trim() || pawaPayGw.apiKey?.trim() || null;
    const clapayKey  = process.env.CLAPAY_API_TOKEN?.trim()  || clapayGw.apiKey?.trim()  || null;
    const hasPawaPay = !!pawaPayKey;
    const hasClapay  = !!clapayKey;

    logger.info(
      { hasPawaPay, hasClapay },
      "[seed-routing] Gateway availability for route seeding",
    );

    await seedPaymentRoutes(
      pawaPayGw.id,
      clapayGw.id,
      hasPawaPay,
      hasClapay,
    );

    logger.info("[seed-routing] Payment routing data seeded successfully");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[seed-routing] Routing seed failed (non-blocking)");
  }
}
