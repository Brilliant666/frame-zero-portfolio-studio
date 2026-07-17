const SAFE_CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/u;

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Resolves Vite's locally-scoped class names from an inline CSS Module string.
 * The inline query keeps Lab styles out of the production route CSS graph while
 * preserving the isolation guarantees of CSS Modules inside each Lab route.
 */
export function createInlineCssModule(css: string): Readonly<Record<string, string>> {
  const cache = new Map<string, string>();

  return new Proxy(Object.create(null) as Record<string, string>, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      if (!SAFE_CLASS_NAME.test(property)) {
        throw new Error(`Invalid inline CSS Module class name: ${property}`);
      }

      const cached = cache.get(property);
      if (cached) return cached;

      const match = css.match(
        new RegExp(`\\.(_${escapeRegularExpression(property)}_[A-Za-z0-9_-]+)`, "u"),
      );
      if (!match) throw new Error(`Missing inline CSS Module class: ${property}`);

      cache.set(property, match[1]);
      return match[1];
    },
  });
}
