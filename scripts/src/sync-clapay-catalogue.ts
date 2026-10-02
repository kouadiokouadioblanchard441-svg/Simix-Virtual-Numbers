import { pool } from "@workspace/db";

try {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set(["--dry-run", "--activate"]);
  const unknown = [...args].filter(arg => !allowed.has(arg));
  if (unknown.length) {
    console.error(`Unknown option(s): ${unknown.join(", ")}`);
    process.exitCode = 2;
  } else {
    const catalogueServicePath = "../../artifacts/api-server/src/lib/clapay-catalogue-sync.ts";
    const { syncClapayCatalogue } = await import(catalogueServicePath);
    const result = await syncClapayCatalogue({
      dryRun: args.has("--dry-run"),
      activate: args.has("--activate"),
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exitCode = 1;
  }
} catch {
  console.error(JSON.stringify({
    success: false,
    errors: [{ countryCode: null, message: "Clapay catalogue synchronization failed safely." }],
  }));
  process.exitCode = 1;
} finally {
  await pool.end();
}