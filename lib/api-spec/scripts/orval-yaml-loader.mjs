export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (
    result.format === "module" &&
    /\/node_modules\/orval\/dist\/[^/]+\.mjs$/.test(new URL(url).pathname)
  ) {
    const source = String(result.source);
    return {
      ...result,
      source: source.replace(
        /import yaml from (["'])js-yaml\1;/g,
        'import * as yaml from "js-yaml";',
      ),
    };
  }
  return result;
}
