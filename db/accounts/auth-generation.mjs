// Schema-only configuration. No connection is opened and no real credentials are read.
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { authOptions } from './auth-options.mjs';
export const auth = betterAuth({
  ...authOptions({ origin: 'http://127.0.0.1:3003', secret: 'schema-generation-only-not-a-runtime-secret' }),
  database: drizzleAdapter({}, { provider: 'pg' }),
});
