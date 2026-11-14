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
// The VM has no real database, logger, or network access.
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
  sendSupportMessageAlert(data: {
    conversationId: string; userId?: string; userName: string;
    message: string; hasImage: boolean; imageData?: string;
  }): Promise<void>;
};

async function harness(env: Record<string, string> = {
  TELEGRAM_BOT_TOKEN: " fake-test-token ",
  TELEGRAM_CHAT_ID: " fake-test-chat ",
  TELEGRAM_ALERTS_ENABLED: "true",
}) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const flags: string[] = [];
  const warnings: Array<{ fields: unknown; message: string }> = [];
  let telegramResult: unknown = { ok: true };
  const usersTable = { fullName: "fullName", phone: "phone", countryCode: "countryCode", id: "id" };
  const dependencies: Record<string, unknown> = {
    "@workspace/db": {
      db: { select: () => assert.fail("Telegram credentials must not be read from the database") },
      usersTable,
    },
    "drizzle-orm": {
      eq: (column: unknown, value: unknown) => [column, value],
    },
    "./logger": {
      logger: {
        warn: (fields: unknown, message: string) => warnings.push({ fields, message }),
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
    process: { env },
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
      timeout: (milliseconds: number) => `mock-timeout-signal-${milliseconds}`,
    },
    Blob,
    Buffer,
    FormData,
    setTimeout,
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => telegramResult };
    },
  });
  return {
    alerts: module.exports as TelegramModule,
    assertMessage(expectedText: string, expectedFlags: string[] = ["CI"]) {
      assert.deepEqual(flags, expectedFlags);
      assert.equal(requests.length, 1, "Each alert sends exactly one message");
      const { url, init } = requests[0]!;
      assert.equal(url, "https://api.telegram.org/botfake-test-token/sendMessage");
      assert.equal(init.method, "POST");
      assert.equal(JSON.stringify(init.headers), '{"Content-Type":"application/json"}');
      assert.equal(init.signal, "mock-timeout-signal-5000");
      assert.deepEqual(JSON.parse(String(init.body)), {
        chat_id: "fake-test-chat",
        text: expectedText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    },
    assertSupportAlert(expectedText: string, withImage: boolean, imageMethod = "sendPhoto") {
      assert.equal(requests.length, withImage ? 2 : 1);
      const textRequest = requests[0]!;
      assert.equal(textRequest.url, "https://api.telegram.org/botfake-test-token/sendMessage");
      assert.equal(textRequest.init.signal, "mock-timeout-signal-5000");
      const textPayload = JSON.parse(String(textRequest.init.body));
      assert.equal(textPayload.chat_id, "fake-test-chat");
      assert.equal(textPayload.parse_mode, "HTML");
      assert.equal(textPayload.text, expectedText);
      if (withImage) {
        const photoRequest = requests[1]!;
        assert.equal(photoRequest.url, `https://api.telegram.org/botfake-test-token/${imageMethod}`);
        assert.equal(photoRequest.init.method, "POST");
        assert.equal(photoRequest.init.signal, "mock-timeout-signal-10000");
        assert.ok(photoRequest.init.body instanceof FormData);
        const form = photoRequest.init.body as FormData;
        assert.equal(form.get("chat_id"), "fake-test-chat");
        assert.equal(form.get("parse_mode"), "HTML");
        assert.equal(form.get("caption"), [
          "🖼️ <b>Image envoyée au support</b>",
          "👤 Alice &lt;Test&gt;",
          "🆔 <code>user-42</code>",
          "🗂️ Conversation <code>conversation-7</code>",
        ].join("\n"));
        const field = imageMethod === "sendPhoto" ? "photo" : "document";
        assert.equal((form.get(field) as Blob).type, imageMethod === "sendPhoto" ? "image/png" : "image/webp");
      }
    },
    supportTextMessages() {
      return requests
        .filter(request => request.url.endsWith("/sendMessage"))
        .map(request => JSON.parse(String(request.init.body)).text as string);
    },
    setTelegramResult(result: unknown) {
      telegramResult = result;
    },
    requestCount() {
      return requests.length;
    },
    warnings,
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

test("support message forwards escaped identity, redacts labeled secrets, and sends the image", async () => {
  const h = await harness();
  await h.alerts.sendSupportMessageAlert({
    conversationId: "conversation-7",
    userId: "user-42",
    userName: "Alice <Test>",
    message: "Mon mot de passe est secret avec espaces; et <bonjour>; mon code est 123456; Bearer abcdefghijklmnop; sk-12345678901234567890",
    hasImage: true,
    imageData: "data:image/png;base64,aGVsbG8=",
  });
  h.assertSupportAlert([
    "<b>💬 Nouveau message au support</b>",
    "",
    "👤 <b>Nom :</b> Alice &lt;Test&gt;",
    "🆔 <b>ID utilisateur :</b> <code>user-42</code>",
    "🗂️ <b>Conversation :</b> <code>conversation-7</code>",
    "",
    "<b>Message :</b>\nMon mot de passe est [masqué]; et &lt;bonjour&gt;; mon code est [masqué]; Bearer [masqué]; [secret masqué]",
    "",
    "🖼️ Image jointe (transmission à Telegram demandée)",
    "",
    timestamp,
  ].join("\n"), true);
});

test("support message without an account sends text only", async () => {
  const h = await harness();
  await h.alerts.sendSupportMessageAlert({
    conversationId: "conversation-8",
    userName: "Utilisateur non connecté",
    message: "Bonjour au support",
    hasImage: false,
  });
  h.assertSupportAlert([
    "<b>💬 Nouveau message au support</b>",
    "",
    "👤 <b>Nom :</b> Utilisateur non connecté",
    "🆔 <b>Compte :</b> Non connecté",
    "🗂️ <b>Conversation :</b> <code>conversation-8</code>",
    "",
    "<b>Message :</b>\nBonjour au support",
    "",
    timestamp,
  ].join("\n"), false);
});

test("long support messages are split without dropping text", async () => {
  const h = await harness();
  const message = "a".repeat(1801);
  await h.alerts.sendSupportMessageAlert({
    conversationId: "conversation-long",
    userName: "Alice",
    message,
    hasImage: false,
  });
  const messages = h.supportTextMessages();
  assert.equal(messages.length, 2);
  assert.ok(messages[0]!.endsWith(`<b>Message :</b>\n${"a".repeat(1800)}\n\n${timestamp}`));
  assert.ok(messages[1]!.includes(`<b>Message (suite) :</b>\na`));
  const chunks = messages.map(item => item.match(/<b>Message(?: \(suite\))? :<\/b>\n([^\n]*)/)?.[1] ?? "");
  assert.equal(chunks.join(""), message);
});

test("support images unsupported by sendPhoto are forwarded as documents", async () => {
  const h = await harness();
  await h.alerts.sendSupportMessageAlert({
    conversationId: "conversation-7",
    userId: "user-42",
    userName: "Alice <Test>",
    message: "Voici l’image",
    hasImage: true,
    imageData: "data:image/webp;base64,aGVsbG8=",
  });
  h.assertSupportAlert([
    "<b>💬 Nouveau message au support</b>",
    "",
    "👤 <b>Nom :</b> Alice &lt;Test&gt;",
    "🆔 <b>ID utilisateur :</b> <code>user-42</code>",
    "🗂️ <b>Conversation :</b> <code>conversation-7</code>",
    "",
    "<b>Message :</b>\nVoici l’image",
    "",
    "🖼️ Image jointe (transmission à Telegram demandée)",
    "",
    timestamp,
  ].join("\n"), true, "sendDocument");
});

test("support alert logs Telegram API failures even when HTTP status is successful", async () => {
  const h = await harness();
  h.setTelegramResult({ ok: false, description: "bot was blocked" });
  await h.alerts.sendSupportMessageAlert({
    conversationId: "conversation-9",
    userName: "Alice",
    message: "Bonjour",
    hasImage: false,
  });
  assert.equal(h.warnings.length, 1);
  assert.equal(h.warnings[0]!.message, "[Telegram] sendMessage failed");
  assert.equal((h.warnings[0]!.fields as { status: number }).status, 200);
  assert.equal((h.warnings[0]!.fields as { description: string }).description, "bot was blocked");
});

test("Telegram alerts require Plesk environment credentials and do not fall back to database settings", async () => {
  const h = await harness({});
  await h.alerts.sendRegisterAlert({ ...fixture(false), userPhone: null });
  assert.equal(h.requestCount(), 0);
});

test("TELEGRAM_ALERTS_ENABLED=false disables alerts even when credentials are present", async () => {
  const h = await harness({
    TELEGRAM_BOT_TOKEN: "fake-test-token",
    TELEGRAM_CHAT_ID: "fake-test-chat",
    TELEGRAM_ALERTS_ENABLED: "false",
  });
  await h.alerts.sendRegisterAlert({ ...fixture(false), userPhone: null });
  assert.equal(h.requestCount(), 0);
});