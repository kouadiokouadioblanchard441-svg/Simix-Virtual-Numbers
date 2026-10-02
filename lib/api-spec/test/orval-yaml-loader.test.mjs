import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "../scripts/orval-yaml-loader.mjs";

test("adapts only Orval's js-yaml default import", async () => {
  const original = {
    format: "module",
    source: Buffer.from(
      'import yaml from "js-yaml";\nconst spec = yaml.load(text);',
    ),
  };
  const result = await load(
    "file:///workspace/node_modules/.pnpm/orval@8.27.0/node_modules/orval/dist/config-example.mjs",
    {},
    async () => original,
  );
  assert.equal(
    result.source,
    'import * as yaml from "js-yaml";\nconst spec = yaml.load(text);',
  );
});

test("does not rewrite other packages or already compatible imports", async () => {
  const original = { format: "module", source: 'import yaml from "js-yaml";' };
  assert.equal(
    await load(
      "file:///workspace/node_modules/other/dist/index.mjs",
      {},
      async () => original,
    ),
    original,
  );
  const compatible = {
    format: "module",
    source: 'import * as yaml from "js-yaml";',
  };
  assert.deepEqual(
    await load(
      "file:///workspace/node_modules/orval/dist/index.mjs",
      {},
      async () => compatible,
    ),
    compatible,
  );
});
