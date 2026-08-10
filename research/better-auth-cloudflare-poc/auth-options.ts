import { admin, username } from "better-auth/plugins";

import { isPortfolioUsernameAllowed } from "./portfolio-adapter";

export const AUTH_POC_BASE_PATH = "/api/auth";
export const AUTH_POC_LOCAL_ORIGIN = "http://127.0.0.1:3001";
export const AUTH_POC_HOSTED_ORIGIN = "https://photo.cosflow.icu";

export function createAuthPocPlugins() {
  return [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 32,
      usernameNormalization: (value) => value.toLowerCase(),
      usernameValidator: isPortfolioUsernameAllowed,
      validationOrder: { username: "post-normalization" },
    }),
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
  ];
}

export function createAuthPocBaseOptions(input: {
  baseURL: string;
  secret: string;
  trustedOrigins: readonly [string, ...string[]];
}) {
  return {
    appName: "Portfolio Platform Auth POC",
    baseURL: input.baseURL,
    basePath: AUTH_POC_BASE_PATH,
    secret: input.secret,
    trustedOrigins: [...input.trustedOrigins],
    disabledPaths: ["/is-username-available"],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
    },
    advanced: {
      database: { generateId: "uuid" as const },
    },
    plugins: createAuthPocPlugins(),
  };
}
