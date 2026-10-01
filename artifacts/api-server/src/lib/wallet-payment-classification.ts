function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchesMobileOperatorMethod(
  methodSlug: string,
  methodName: string,
  operatorSlug: string,
  operatorName: string,
): boolean {
  const slug = normalize(methodSlug);
  const name = normalize(methodName);
  const operatorSlugNormalized = normalize(operatorSlug);
  const operatorNameNormalized = normalize(operatorName);
  const slugTokens = methodSlug.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const nameTokens = methodName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  return slug === operatorSlugNormalized ||
    name === operatorNameNormalized ||
    slug === operatorNameNormalized ||
    name === operatorSlugNormalized ||
    slugTokens.includes(operatorSlug.toLowerCase()) ||
    nameTokens.includes(operatorSlug.toLowerCase()) ||
    (operatorNameNormalized.length > 3 && (slug.includes(operatorNameNormalized) || name.includes(operatorNameNormalized)));
}