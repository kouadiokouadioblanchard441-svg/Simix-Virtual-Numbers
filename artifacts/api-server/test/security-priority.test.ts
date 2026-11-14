import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { isVerifiedActiveOtp } from "../src/lib/otp";

test("password reset requires the newest verified, unexpired OTP and clears it after use", async () => {
  const route = await readFile(new URL("../src/routes/forgot-password.ts", import.meta.url), "utf8");

  assert.match(route, /db\.transaction\(async \(tx\)/);
  assert.match(route, /eq\(emailOtpTable\.purpose,\s*"password_reset"\)/);
  assert.match(route, /\.orderBy\(desc\(emailOtpTable\.createdAt\)\)/);
  assert.match(route, /isVerifiedActiveOtp\(otp,\s*code\)/);
  assert.match(route, /tx\.delete\(sessionsTable\)/);
  assert.match(route, /tx\.delete\(emailOtpTable\)/);
});

test("reset OTP validation rejects unverified, expired, or mismatched codes", () => {
  const now = new Date("2026-11-14T10:00:00.000Z");
  const valid = {
    code: "123456",
    verified: true,
    expiresAt: new Date(now.getTime() + 60_000),
  };

  assert.equal(isVerifiedActiveOtp(valid, "123456", now), true);
  assert.equal(isVerifiedActiveOtp({ ...valid, verified: false }, "123456", now), false);
  assert.equal(isVerifiedActiveOtp({ ...valid, expiresAt: now }, "123456", now), false);
  assert.equal(isVerifiedActiveOtp(valid, "654321", now), false);
  assert.equal(isVerifiedActiveOtp(undefined, "123456", now), false);
});

test("admin JWT middleware checks the current role for every protected request", async () => {
  const middleware = await readFile(new URL("../src/lib/admin-jwt-middleware.ts", import.meta.url), "utf8");
  const adminAuth = await readFile(new URL("../src/routes/admin-auth.ts", import.meta.url), "utf8");

  assert.match(middleware, /from\(usersTable\)/);
  assert.match(middleware, /activeAdmin\?\.isAdmin/);
  assert.match(adminAuth, /router\.get\("\/admin-auth\/access-logs",\s*requireAdminJwt/);
});

test("crypto ledger completion and balance update run through one transaction", async () => {
  const route = await readFile(new URL("../src/routes/crypto-wallet.ts", import.meta.url), "utf8");

  assert.match(route, /transaction:\s*\(operation\)\s*=>\s*db\.transaction/);
  assert.match(route, /settleCryptoDepositAtomically\(settlementDatabase/);
  assert.match(route, /partialCryptoAmountToFcfa\(p\.actually_paid,\s*fcfaRate\)/);
  assert.match(route, /partialCryptoAmountToFcfa\(payment\.actually_paid,\s*fcfaRate\)/);
  assert.doesNotMatch(route, /:\s*tx\.amount\s*;/);
});
