import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import type {
  LoginAlertData,
  RegisterAlertData,
  NumberBuyAlertData,
} from "../src/lib/telegram";
import type { GeoInfo } from "../src/lib/geoip";

// Compile only telegram.ts, without resolving/importing its runtime dependencies.
// The VM has no process, real database, logger, or network access.
const compiled = readFile(new URL("../src/lib/telegram.ts", import.meta.url), "utf8")
  .then(source => transform(source, { loader: "ts", format: "cjs", target: "node20" }));

type TelegramModule = {
  sendRegisterAlert(data: RegisterAlertData): Promise<void>;
  sendLoginAlert(data: LoginAlertData): Promise<void>;
  sendNumberBuyAlert(data: NumberBuyAlertData): Promise<void>;
  sendDepositAlert(data: {
    userId: string; userName: string; userPhone: string | null; amount: number;
    currency: string; gateway: string; operator: string; countryCode: string;
    ip?: string; geo?: Partial<GeoInfo>; transactionId: string;
  }): Promise<void>;
  sendAuditAlert(data: {
    action: string; description: string; userId?: string; userName?: string;
    ip?: string; geo?: Partial<GeoInfo>; severity?: "info" | "warning" | "critical";
  }): Promise<void>;
  sendOtpEventAlert(data: {
    event: string; purpose: string; userId?: string; userName?: string;
    email?: string; identifier?: string; ip?: string; detail?: string;
  }): Promise<void>;
};

async function harness() {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const settingsRead: string[] = [];
  const flags: string[] = [];
  const settings: Record<string, string> = {
    telegram_bot_token: " fake-test-token ",
    telegram_chat_id: " fake-test-chat ",
    telegram_alerts_enabled: "true",
  };
  const table = { key: "mock-setting-key" };
  const dependencies: Record<string, unknown> = {
    "@workspace/db": {
      systemSettingsTable: table,
      db: {
        select: () => ({
          from: (selectedTable: unknown) => {
            assert.equal(selectedTable, table);
            return {
              where: (key: string) => ({
                limit: async (limit: number) => {
                  assert.equal(limit, 1);
                  assert.ok(Object.hasOwn(settings, key), `Unexpected setting: ${key}`);
                  settingsRead.push(key);
                  return [{ value: settings[key] }];
                },
              }),
            };
          },
        }),
      },
    },
    "drizzle-orm": {
      eq: (column: unknown, key: string) => {
        assert.equal(column, table.key);
        return key;
      },
    },
    "./logger": {
      logger: {
        warn: () => assert.fail("Unexpected Telegram warning"),
        debug: () => assert.fail("Unexpected Telegram error"),
      },
    },
    "./geoip": {
      countryFlag: (code: string) => {
        flags.push(code);
        return "🇨🇮";
      },
    },
  };
  const module = { exports: {} };
  runInNewContext((await compiled).code, {
    module,
    exports: module.exports,
    require: (id: string) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unmocked dependency: ${id}`);
      return dependencies[id];
    },
    Date: class {
      static now() { return 1_800_000_000_000; }
      toLocaleString(locale: string, options: unknown) {
        assert.equal(locale, "fr-FR");
        assert.equal(JSON.stringify(options), '{"timeZone":"Africa/Abidjan"}');
        return "02/10/2026 12:00:00";
      }
    },
    AbortSignal: {
      timeout: (milliseconds: number) => {
        assert.equal(milliseconds, 5000);
        return "mock-timeout-signal";
      },
    },
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return { ok: true };
    },
  });
  return {
    alerts: module.exports as TelegramModule,
    assertMessage(expectedText: string, expectedFlags: string[] = ["CI"]) {
      assert.deepEqual(settingsRead.sort(), [
        "telegram_alerts_enabled", "telegram_bot_token", "telegram_chat_id",
      ]);
      assert.deepEqual(flags, expectedFlags);
      assert.equal(requests.length, 1, "Each alert sends exactly one message");
      const { url, init } = requests[0]!;
      assert.equal(url, "https://api.telegram.org/botfake-test-token/sendMessage");
      assert.equal(init.method, "POST");
      assert.equal(JSON.stringify(init.headers), '{"Content-Type":"application/json"}');
      assert.equal(init.signal, "mock-timeout-signal");
      assert.deepEqual(JSON.parse(String(init.body)), {
        chat_id: "fake-test-chat",
        text: expectedText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    },
  };
}

const cases = [
  { name: "null phone", phone: null, expectedPhone: "–", html: false },
  { name: "populated phone", phone: "+2250100000000", expectedPhone: "+2250100000000", html: false },
  {
    name: "HTML characters in user identity, phone and context",
    phone: "<phone>&", expectedPhone: "&lt;phone&gt;&amp;", html: true,
  },
] as const;

function fixture(html: boolean) {
  return {
    userId: html ? "<id>&" : "user-test-123",
    userName: html ? "<Alice>&" : "Alice Test",
    ip: html ? "<ip>&" : "192.0.2.1",
    countryCode: html ? "<country-code>&" : "CI",
    geo: {
      countryCode: "CI",
      country: html ? "<country>&" : "Côte d’Ivoire",
      city: html ? "<city>&" : "Abidjan",
      region: html ? "<region>&" : "Lagunes",
      isp: html ? "<isp>&" : "Test ISP",
      timezone: html ? "<timezone>&" : "Africa/Abidjan",
    },
  };
}

function expected(html: boolean) {
  return html ? {
    id: "&lt;id&gt;&amp;", name: "&lt;Alice&gt;&amp;", ip: "&lt;ip&gt;&amp;",
    accountCountry: "&lt;country-code&gt;&amp;", country: "&lt;country&gt;&amp;",
    city: "&lt;city&gt;&amp;", region: "&lt;region&gt;&amp;",
    isp: "&lt;isp&gt;&amp;", timezone: "&lt;timezone&gt;&amp;",
  } : {
    id: "user-test-123", name: "Alice Test", ip: "192.0.2.1",
    accountCountry: "CI", country: "Côte d’Ivoire", city: "Abidjan",
    region: "Lagunes", isp: "Test ISP", timezone: "Africa/Abidjan",
  };
}

const timestamp = "🕒 02/10/2026 12:00:00";

for (const scenario of cases) {
  test(`registration alert formats ${scenario.name} and preserves user identity`, async () => {
    const h = await harness();
    const e = expected(scenario.html);
    await h.alerts.sendRegisterAlert({ ...fixture(scenario.html), userPhone: scenario.phone });
    h.assertMessage([
      "<b>🎉 Nouvel utilisateur inscrit</b>", "",
      `👤 <b>Nom :</b> ${e.name}`,
      `📞 <b>Téléphone :</b> <code>${scenario.expectedPhone}</code>`,
      `🌍 <b>Pays compte :</b> ${e.accountCountry}`,
      `🆔 <b>ID :</b> <code>${e.id}</code>`, "",
      `🌐 <b>IP :</b> <code>${e.ip}</code>`,
      `🇨🇮 <b>Localisation :</b> ${e.city}, ${e.country}`,
      `📡 <b>FAI :</b> ${e.isp}`, "", timestamp,
    ].join("\n"));
  });

  // Cover both successful and failed login formatting for every phone variant.
  for (const success of [true, false]) {
    test(`${success ? "successful" : "failed"} login alert formats ${scenario.name} and preserves user identity`, async () => {
      const h = await harness();
      const e = expected(scenario.html);
      await h.alerts.sendLoginAlert({
        ...fixture(scenario.html),
        userPhone: scenario.phone,
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0",
        success,
        ...(!success ? { failReason: scenario.html ? "<reason>&" : "Mot de passe incorrect" } : {}),
      });
      h.assertMessage([
        success ? "<b>✅ Nouvelle connexion</b>" : "<b>🚨 Tentative de connexion échouée</b>", "",
        `👤 <b>Utilisateur :</b> ${e.name}`,
        `📞 <b>Téléphone :</b> <code>${scenario.expectedPhone}</code>`,
        `🆔 <b>ID :</b> <code>${e.id}</code>`, "",
        `🌐 <b>Adresse IP :</b> <code>${e.ip}</code>`,
        `🇨🇮 <b>Pays :</b> ${e.country}`,
        `🏙️ <b>Ville :</b> ${e.city}`,
        `📍 <b>Région :</b> ${e.region}`,
        `📡 <b>FAI / ISP :</b> ${e.isp}`,
        `🕐 <b>Fuseau :</b> ${e.timezone}`, "",
        "🖥️ Desktop <b>Appareil :</b> Desktop",
        "🌍 <b>Navigateur :</b> Chrome",
        "💻 <b>Système :</b> Windows",
        ...(!success ? ["", `❌ <b>Raison échec :</b> ${scenario.html ? "&lt;reason&gt;&amp;" : "Mot de passe incorrect"}`] : []),
        "", timestamp,
      ].join("\n"));
    });
  }

  test(`number purchase alert formats ${scenario.name} and preserves user name`, async () => {
    const h = await harness();
    const e = expected(scenario.html);
    await h.alerts.sendNumberBuyAlert({
      ...fixture(scenario.html),
      userPhone: scenario.phone,
      service: scenario.html ? "<service>&" : "WhatsApp",
      numberCountry: scenario.html ? "<number-country>&" : "France",
      virtualNumber: scenario.html ? "<number>&" : "+33100000000",
      price: 500,
    });
    // The current purchase format identifies the user by name/phone, not by ID.
    h.assertMessage([
      "<b>📲 Achat numéro virtuel</b>", "",
      `👤 <b>Utilisateur :</b> ${e.name} (<code>${scenario.expectedPhone}</code>)`,
      `🔧 <b>Service :</b> ${scenario.html ? "&lt;service&gt;&amp;" : "WhatsApp"}`,
      `🌍 <b>Pays numéro :</b> ${scenario.html ? "&lt;number-country&gt;&amp;" : "France"}`,
      `📱 <b>Numéro :</b> <code>${scenario.html ? "&lt;number&gt;&amp;" : "+33100000000"}</code>`,
      "💵 <b>Prix :</b> 500 FCFA", "",
      `🌐 <b>IP :</b> <code>${e.ip}</code>`,
      `🇨🇮 <b>Localisation :</b> ${e.city}, ${e.country}`, "", timestamp,
    ].join("\n"));
  });
}

test("failed login for an unknown account reports the attempted identifier only", async () => {
  const h = await harness();
  await h.alerts.sendLoginAlert({
    attemptedIdentifier: "person@example.test",
    ip: "192.0.2.10",
    userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile",
    geo: {},
    success: false,
    failReason: "Identifiants invalides",
  });

  h.assertMessage([
    "<b>🚨 Tentative de connexion échouée</b>", "",
    "👤 <b>Utilisateur :</b> Non identifié",
    "🔎 <b>Identifiant tenté :</b> <code>person@example.test</code>",
    "",
    "🌐 <b>Adresse IP :</b> <code>192.0.2.10</code>",
    "🇨🇮 <b>Pays :</b> –",
    "🏙️ <b>Ville :</b> –",
    "📍 <b>Région :</b> –",
    "📡 <b>FAI / ISP :</b> –",
    "🕐 <b>Fuseau :</b> –", "",
    "📱 Mobile <b>Appareil :</b> Mobile",
    "🌍 <b>Navigateur :</b> Chrome",
    "💻 <b>Système :</b> Android", "",
    "❌ <b>Raison échec :</b> Identifiants invalides", "", timestamp,
  ].join("\n"), [""]);
});

test("OTP alert reports status and context without exposing the code", async () => {
  const h = await harness();
  await h.alerts.sendOtpEventAlert({
    event: "Échec de vérification",
    purpose: "Réinitialisation du mot de passe",
    userId: "user-test-123",
    userName: "Alice Test",
    email: "alice@example.test",
    ip: "192.0.2.11",
    detail: "Code incorrect; valeur non transmise.",
  });

  h.assertMessage([
    "<b>🔐 OTP — Échec de vérification</b>", "",
    "🎯 <b>Motif :</b> Réinitialisation du mot de passe",
    "👤 <b>Utilisateur :</b> Alice Test",
    "🆔 <b>ID :</b> <code>user-test-123</code>",
    "✉️ <b>Email :</b> alice@example.test",
    "🌐 <b>IP :</b> <code>192.0.2.11</code>",
    "📋 <b>Détail :</b> Code incorrect; valeur non transmise.", "",
    timestamp,
  ].join("\n"), []);
});

test("deposit alert formats a confirmed credit without request IP data", async () => {
  const h = await harness();
  await h.alerts.sendDepositAlert({
    userId: "user-test-123",
    userName: "Alice Test",
    userPhone: "+2250100000000",
    amount: 5000,
    currency: "FCFA",
    gateway: "PawaPay",
    operator: "Orange Money",
    countryCode: "CI",
    transactionId: "tx-test-123",
    geo: {},
  });

  h.assertMessage([
    "<b>💰 Nouvelle recharge</b>", "",
    "👤 <b>Utilisateur :</b> Alice Test (<code>+2250100000000</code>)",
    `💵 <b>Montant :</b> <b>5\u202f000 FCFA</b>`,
    "🏦 <b>Gateway :</b> PawaPay",
    "📱 <b>Opérateur :</b> Orange Money",
    "🔖 <b>Transaction ID :</b> <code>tx-test-123</code>", "",
    timestamp,
  ].join("\n"));
});

test("audit alert reports admin action and HTTP result without request body", async () => {
  const h = await harness();
  await h.alerts.sendAuditAlert({
    action: "Admin PATCH",
    description: "/api/admin/settings — HTTP 200",
    userId: "admin-test-1",
    userName: "admin@example.test",
    ip: "192.0.2.12",
    severity: "info",
  });

  h.assertMessage([
    "<b>ℹ️ Audit — Admin PATCH</b>", "",
    "📋 <b>Description :</b> /api/admin/settings — HTTP 200",
    "👤 <b>Utilisateur :</b> admin@example.test",
    "🆔 <b>ID :</b> <code>admin-test-1</code>",
    "🌐 <b>IP :</b> <code>192.0.2.12</code>", "",
    timestamp,
  ].join("\n"), []);
});