export type BrandIdentitySource = Readonly<{
  brand: string;
  mark: string;
}>;

export type ResolvedBrandIdentity = Readonly<{
  name: string;
  mark: string;
  hasIdentity: boolean;
  hasDistinctMark: boolean;
}>;

/**
 * Resolves the two persisted brand fields for presentation only.
 *
 * Either field may be left empty. The other field then becomes the shared
 * display value, while two empty fields stay empty instead of falling back to
 * the demo brand or inventing an abbreviation.
 */
export function resolveBrandIdentity(source: BrandIdentitySource): ResolvedBrandIdentity {
  const configuredName = source.brand.trim();
  const configuredMark = source.mark.trim();
  const name = configuredName || configuredMark;
  const mark = configuredMark || configuredName;

  return {
    name,
    mark,
    hasIdentity: name.length > 0,
    hasDistinctMark: configuredName.length > 0
      && configuredMark.length > 0
      && configuredName !== configuredMark,
  };
}

/** Joins template vocabulary to a configured identity without orphan punctuation. */
export function withBrandPrefix(brand: string, text: string, separator = " · ") {
  const normalizedBrand = brand.trim();
  const normalizedText = text.trim();

  if (!normalizedBrand) return normalizedText;
  if (!normalizedText) return normalizedBrand;
  return `${normalizedBrand}${separator}${normalizedText}`;
}
