import { betterAuth } from "better-auth";

import {
  AUTH_POC_LOCAL_ORIGIN,
  createAuthPocBaseOptions,
} from "./auth-options";

const ephemeralCliSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`;

export const auth = betterAuth(
  createAuthPocBaseOptions({
    baseURL: "http://127.0.0.1:3001",
    secret: ephemeralCliSecret,
    trustedOrigins: [AUTH_POC_LOCAL_ORIGIN],
  }),
);
