const RESERVED_USERNAMES = new Set([
  "_media",
  "admin",
  "api",
  "auth",
  "login",
  "logout",
  "register",
  "settings",
  "signup",
]);

export type AuthApiForProvisioning = {
  createUser(input: {
    body: {
      email: string;
      password: string;
      name: string;
      role: "admin" | "user";
      data: { username: string; displayUsername: string };
    };
  }): Promise<{ user: { id: string; email: string; username?: string | null } }>;
};

export type SyntheticPortfolioUser = {
  id: string;
  authUserId: string;
  username: string;
};

export type SyntheticSite = {
  id: string;
  ownerUserId: string;
  slug: string;
};

export function canonicalizePortfolioUsername(value: string) {
  return value.toLowerCase();
}

export function isPortfolioUsernameAllowed(value: string) {
  const canonical = canonicalizePortfolioUsername(value);
  return (
    /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(canonical) &&
    !canonical.includes("--") &&
    !RESERVED_USERNAMES.has(canonical)
  );
}

export async function provisionAuthUser(
  api: AuthApiForProvisioning,
  input: {
    username: string;
    email: string;
    password: string;
    role?: "admin" | "user";
  },
) {
  const username = canonicalizePortfolioUsername(input.username);
  if (!isPortfolioUsernameAllowed(username)) {
    throw new Error("invalid_portfolio_username");
  }

  return api.createUser({
    body: {
      email: input.email,
      password: input.password,
      name: username,
      role: input.role ?? "user",
      data: { username, displayUsername: username },
    },
  });
}

export function authorizeSyntheticSite(
  authUserId: string,
  siteSlug: string,
  users: readonly SyntheticPortfolioUser[],
  sites: readonly SyntheticSite[],
) {
  const portfolioUser = users.find((user) => user.authUserId === authUserId);
  if (!portfolioUser) return null;
  const site = sites.find((candidate) => candidate.slug === siteSlug);
  if (!site || site.ownerUserId !== portfolioUser.id) return null;
  return {
    authUserId,
    userId: portfolioUser.id,
    siteId: site.id,
    siteSlug: site.slug,
    role: "owner" as const,
  };
}
