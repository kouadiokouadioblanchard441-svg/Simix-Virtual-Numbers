import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("wallet routes use the shared wallet gateway resolver", async () => {
  const wallet = await readFile(new URL("../src/routes/wallet.ts", import.meta.url), "utf8");
  const gateway = await readFile(new URL("../src/lib/wallet-gateway.ts", import.meta.url), "utf8");

  assert.match(wallet, /from ["']\.\.\/lib\/wallet-gateway["']/);
  assert.match(wallet, /import \{[^}]*\bresolveWalletGateway\b[^}]*\} from ["']\.\.\/lib\/wallet-gateway["']/s);
  assert.match(wallet, /\bresolveWalletGateway\(/);
  assert.doesNotMatch(wallet, /function\s+resolveWalletGateway\s*\(/);
  assert.match(gateway, /export async function resolveWalletGateway\s*\(/);
});