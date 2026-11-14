import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readApi = (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
const readWorkspace = (path: string) =>
  readFile(new URL(`../../../${path}`, import.meta.url), "utf8");

test("PIN verification and lockout are server-side and use a password hash", async () => {
  const [security, routes, frontend] = await Promise.all([
    readApi("lib/account-security.ts"),
    readApi("routes/account-security.ts"),
    readWorkspace("artifacts/simix/src/lib/pin/pin-store.ts"),
  ]);

  assert.match(security, /bcrypt\.hash\(pin, 12\)/);
  assert.match(security, /bcrypt\.compare\(pin, row\.pinHash\)/);
  assert.match(security, /PIN_MAX_ATTEMPTS = 5/);
  assert.match(security, /PIN_LOCKOUT_MS = 5 \* 60_000/);
  assert.match(security, /\.for\("update"\)/);
  assert.match(routes, /router\.post\("\/auth\/me\/pin\/verify", requireAuth/);
  assert.doesNotMatch(frontend, /localStorage\.setItem/);
  assert.doesNotMatch(frontend, /crypto\.subtle|pinHash|pinSalt/);
});

test("email two-factor challenges are expiring, hashed, one-time, and rate-limited", async () => {
  const [security, routes, auth, email] = await Promise.all([
    readApi("lib/account-security.ts"),
    readApi("routes/account-security.ts"),
    readApi("routes/auth.ts"),
    readApi("lib/email.ts"),
  ]);

  assert.match(security, /TWO_FACTOR_CODE_TTL_MS = 10 \* 60_000/);
  assert.match(security, /bcrypt\.hash\(code, 12\)/);
  assert.match(security, /TWO_FACTOR_MAX_ATTEMPTS = 5/);
  assert.match(security, /consumedAt: new Date\(\)/);
  assert.match(auth, /createLoginTwoFactorChallenge\(user\.id\)/);
  const twoFactorBranch = auth.indexOf(
    "if (accountSecurity.available && accountSecurity.twoFactorEnabled)",
  );
  const sessionCreatedAfterChallenge = auth.indexOf(
    "const session = await createSession(user.id)",
    twoFactorBranch,
  );
  assert.ok(twoFactorBranch >= 0 && sessionCreatedAfterChallenge > twoFactorBranch);
  assert.match(routes, /recordPersistentFailedAttemptAndLock/);
  assert.match(routes, /router\.post\("\/auth\/login\/2fa\/verify"/);
  assert.match(email, /purpose: "register" \| "inactivity" \| "two_factor"/);
  assert.doesNotMatch(routes, /sendOtpEventAlert\(\{[^}]*code,/s);
});

test("admin JWT is delivered only as an HttpOnly cookie", async () => {
  const [middleware, adminAuth, frontendToken, guard, login] = await Promise.all([
    readApi("lib/admin-jwt-middleware.ts"),
    readApi("routes/admin-auth.ts"),
    readWorkspace("artifacts/simix/src/lib/admin-token.ts"),
    readWorkspace("artifacts/simix/src/components/admin-secure-guard.tsx"),
    readWorkspace("artifacts/simix/src/pages/admin/secure-login.tsx"),
  ]);

  assert.match(middleware, /req\.cookies\?\.\["simix_admin_session"\]/);
  assert.doesNotMatch(middleware, /headers\.authorization/);
  assert.match(adminAuth, /httpOnly:\s*true/);
  assert.doesNotMatch(adminAuth, /res\.json\(\{\s*token,/);
  assert.doesNotMatch(frontendToken, /setItem\([^,]+,\s*token\)/);
  assert.doesNotMatch(guard, /Authorization:\s*`Bearer/);
  assert.doesNotMatch(login, /data\.token/);
});

test("security migration is mirrored and recorded in both journals", async () => {
  const [sourceJournal, rootJournal, sourceSql, rootSql] = await Promise.all([
    readWorkspace("lib/db/drizzle/meta/_journal.json"),
    readWorkspace("migrations/meta/_journal.json"),
    readWorkspace("lib/db/drizzle/0024_account_security.sql"),
    readWorkspace("migrations/0024_account_security.sql"),
  ]);

  assert.match(sourceJournal, /0024_account_security/);
  assert.match(rootJournal, /0024_account_security/);
  assert.match(sourceSql, /CREATE TABLE IF NOT EXISTS "account_security"/);
  assert.match(sourceSql, /CREATE TABLE IF NOT EXISTS "login_two_factor_challenges"/);
  assert.equal(rootSql, sourceSql);
});
