import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { imageSignatureMatches } from "../src/lib/upload-validation";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("image upload validation checks actual signatures, not just MIME headers", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const gif = Buffer.from("GIF89a1234");
  const webp = Buffer.from("RIFF1234WEBPdata");

  assert.equal(imageSignatureMatches("image/png", png), true);
  assert.equal(imageSignatureMatches("image/jpeg", jpeg), true);
  assert.equal(imageSignatureMatches("image/gif", gif), true);
  assert.equal(imageSignatureMatches("image/webp", webp), true);
  assert.equal(imageSignatureMatches("image/png", Buffer.from("not an image")), false);
  assert.equal(imageSignatureMatches("image/svg+xml", png), false);
});

test("authentication limits and account locks use shared persistent storage", async () => {
  const limiter = await read("../src/lib/rate-limiter.ts");
  const auth = await read("../src/routes/auth.ts");
  const adminAuth = await read("../src/routes/admin-auth.ts");
  const otp = await read("../src/routes/otp.ts");
  const forgot = await read("../src/routes/forgot-password.ts");
  const security = await read("../src/middlewares/security.ts");
  const numbers = await read("../src/routes/numbers.ts");

  assert.match(limiter, /createHmac\("sha256", secret\)/);
  assert.match(limiter, /\.onConflictDoUpdate\(/);
  assert.match(limiter, /securityRateLimitsTable\.hitCount\} \+ 1/);
  assert.match(auth, /LOGIN_ACCOUNT_MAX_FAILURES = 5/);
  assert.match(auth, /LOGIN_ACCOUNT_LOCKOUT_MS = 10 \* 60_000/);
  assert.match(auth, /recordPersistentFailedAttemptAndLock/);
  assert.match(adminAuth, /isPersistentRateLimited/);
  assert.match(otp, /isPersistentRateLimited/);
  assert.match(forgot, /isPersistentRateLimited/);
  assert.match(security, /isPersistentRateLimited\(`global:/);
  assert.match(auth, /isPersistentRateLimited\(`register:/);
  assert.match(numbers, /isPersistentRateLimited\(`purchase_rate:/);
  assert.match(numbers, /isPersistentRateLimited\(`poll:/);
});

test("Google OAuth avoids persistent rate-limit counters used by email forms", async () => {
  const security = await read("../src/middlewares/security.ts");
  const auth = await read("../src/routes/auth.ts");
  const googleAuth = await read("../src/routes/google-auth.ts");

  assert.match(security, /function isGoogleOAuthPath/);
  assert.match(security, /isWebhookPath\(req\.path\) \|\| isGoogleOAuthPath\(req\.path\)/);
  assert.match(security, /await isPersistentRateLimited\(`global:/);
  assert.match(auth, /recordPersistentFailedAttemptAndLock/);
  assert.doesNotMatch(googleAuth, /isPersistentRateLimited|recordPersistentFailedAttemptAndLock/);
});

test("support conversations enforce account ownership without changing message delivery", async () => {
  const support = await read("../src/routes/support.ts");

  assert.match(support, /ensureSupportConversationAccess/);
  assert.match(support, /return req\.user\?\.id === conv\.userId/);
  assert.match(support, /isValidSupportSessionId/);
  assert.match(support, /30 messages per session per hour/);
  assert.match(support, /support-chat-ip/);
  assert.match(support, /sendSupportMessageAlert/);
  assert.match(support, /data\.imageData \? \{ imageData: data\.imageData \}/);
  assert.doesNotMatch(support, /Access-Control-Allow-Origin", "\*"/);
});

test("uploads require admin access, enforce quotas, validate bytes, and check object ACLs", async () => {
  const storage = await read("../src/routes/storage.ts");

  assert.match(storage, /router\.post\("\/storage\/uploads\/request-url", requireAdminJwt/);
  assert.match(storage, /router\.post\("\/storage\/uploads\/finalize", requireAdminJwt/);
  assert.match(storage, /"\/storage\/uploads\/direct",\s*requireAdminJwt/s);
  assert.match(storage, /enforceAdminUploadRateLimit/);
  assert.match(storage, /hasUploadDiskCapacity/);
  assert.match(storage, /imageSignatureMatches/);
  assert.match(storage, /canAccessObjectEntity/);
  assert.match(storage, /getObjectAclPolicy/);
});

test("admin logout records a durable token revocation checked by protected routes", async () => {
  const middleware = await read("../src/lib/admin-jwt-middleware.ts");
  const adminAuth = await read("../src/routes/admin-auth.ts");

  assert.match(middleware, /adminAccessLogsTable\.action,\s*"logout"/);
  assert.match(middleware, /details\}->>'jti'/);
  assert.match(adminAuth, /router\.post\("\/admin-auth\/logout",\s*requireAdminJwt/);
  assert.match(adminAuth, /"logout",\s*true,\s*payload\.email,\s*\{\s*jti:\s*payload\.jti\s*\}/);
});

test("the rate-limit table migration is recorded in both migration journals", async () => {
  const [sourceJournal, rootJournal, sourceSql, rootSql] = await Promise.all([
    readFile(new URL("../../../lib/db/drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../../../migrations/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../../../lib/db/drizzle/0023_security_rate_limits.sql", import.meta.url), "utf8"),
    readFile(new URL("../../../migrations/0023_security_rate_limits.sql", import.meta.url), "utf8"),
  ]);

  assert.match(sourceJournal, /0023_security_rate_limits/);
  assert.match(rootJournal, /0023_security_rate_limits/);
  assert.match(sourceSql, /CREATE TABLE IF NOT EXISTS "security_rate_limits"/);
  assert.match(rootSql, /CREATE TABLE IF NOT EXISTS "security_rate_limits"/);
});

test("admin and Google login derive client IP from Express proxy trust", async () => {
  const adminAuth = await read("../src/routes/admin-auth.ts");
  const googleAuth = await read("../src/routes/google-auth.ts");

  assert.match(adminAuth, /return req\.ip \?\? "unknown"/);
  assert.match(googleAuth, /const ip = req\.ip \?\? "unknown"/);
  assert.doesNotMatch(adminAuth, /headers\["x-forwarded-for"\]/);
  assert.doesNotMatch(googleAuth, /headers\["x-forwarded-for"\]/);
});
