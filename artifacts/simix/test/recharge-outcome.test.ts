import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rechargeOutcome } from "../src/lib/recharge-outcome";

test("a failed webhook winning the init race never shows recharge success", () => {
  assert.equal(rechargeOutcome({ status: "failed", externalDepositId: "clapay:race" }).state, "failed");
  assert.equal(rechargeOutcome({ status: "failed", pending: true, depositId: "clapay:race" }).state, "failed");
});

test("only completed settlement shows success", () => {
  assert.equal(rechargeOutcome({ status: "completed", externalDepositId: "clapay:race" }).state, "completed");
  assert.equal(rechargeOutcome({ status: "pending", depositId: "clapay:race" }).state, "pending");
  assert.equal(rechargeOutcome({}).state, "unknown");
});

test("unresolved responses keep an available external tracking id", () => {
  assert.deepEqual(rechargeOutcome({ externalDepositId: "clapay:uncertain" }), {
    state: "pending", depositId: "clapay:uncertain",
  });
});