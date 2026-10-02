import { strict as assert } from "node:assert";
import { test } from "node:test";
import { toDirectAction } from "./clapay-direct";

const link = "https://pay.wave.com/test-only-payment";

test("Wave action accepts canonical operator link and provider snake-case link", () => {
  for (const payload of [{ operatorPaymentUrl: link }, { payment_url_operator: link }]) {
    assert.equal(toDirectAction(payload).operatorPaymentUrl, link);
  }
});

test("alternative payment_url is an operator link only for the API payment mode", () => {
  assert.equal(toDirectAction({ paymentMode: "API", payment_url: link }).operatorPaymentUrl, link);
  for (const payload of [{ payment_url: link }, { paymentMode: "CHECKOUTPAGE", payment_url: link }]) {
    assert.equal(toDirectAction(payload).operatorPaymentUrl, null);
  }
});

test("unsafe and missing Wave links never become clickable actions", () => {
  for (const unsafe of ["javascript:alert(1)", "http://pay.wave.com/test", "//pay.wave.com/test", "https://user:pass@pay.wave.com/test", "invalid"]) {
    assert.equal(toDirectAction({ operatorPaymentUrl: unsafe, paymentMode: "API", payment_url: unsafe }).operatorPaymentUrl, null);
  }
  assert.equal(toDirectAction(null).operatorPaymentUrl, null);
  assert.equal(toDirectAction(undefined).operatorPaymentUrl, null);
});

test("operator completion link takes priority and MyNita code remains unchanged", () => {
  const result = toDirectAction({
    operatorPaymentUrl: link, paymentMode: "API", payment_url: "https://example.invalid/alternate",
    paymentOtp: "ACHAT001234", message: "En attente",
  });
  assert.equal(result.operatorPaymentUrl, link);
  assert.equal(result.paymentOtp, "ACHAT001234");
  assert.equal(result.message, "En attente");
});