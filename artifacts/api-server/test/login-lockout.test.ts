import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";

const compiled = readFile(new URL("../src/lib/rate-limiter.ts", import.meta.url), "utf8")
  .then(source => transform(source, { loader: "ts", format: "cjs", target: "node20" }));

test("login lockout starts on the sixth failure and expires after ten minutes", async () => {
  let now = 1_800_000_000_000;
  class TestDate extends Date {
    static now() { return now; }
  }
  const module = { exports: {} as Record<string, unknown> };
  const nativeRequire = createRequire(import.meta.url);
  runInNewContext((await compiled).code, {
    module,
    exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "node:crypto") return nativeRequire(specifier);
      if (specifier === "drizzle-orm") return {};
      if (specifier === "@workspace/db") return { db: {}, securityRateLimitsTable: {} };
      throw new Error(`Unexpected import in rate limiter test: ${specifier}`);
    },
    Date: TestDate,
    process: { env: {} },
    setInterval: () => 0,
  });

  const limiter = module.exports as {
    recordFailedAttemptAndLock: (
      attemptsKey: string,
      lockKey: string,
      maxFailedAttempts: number,
      lockDurationMs: number,
    ) => boolean;
    getTemporaryLockRemaining: (key: string) => number;
  };
  const duration = 10 * 60_000;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal(
      limiter.recordFailedAttemptAndLock("attempts:user-1", "lock:user-1", 5, duration),
      false,
      `attempt ${attempt} should not lock the account`,
    );
  }

  assert.equal(limiter.recordFailedAttemptAndLock("attempts:user-1", "lock:user-1", 5, duration), true);
  assert.equal(limiter.getTemporaryLockRemaining("lock:user-1"), duration);

  now += duration - 1;
  assert.equal(limiter.getTemporaryLockRemaining("lock:user-1"), 1);
  now += 1;
  assert.equal(limiter.getTemporaryLockRemaining("lock:user-1"), 0);
});
