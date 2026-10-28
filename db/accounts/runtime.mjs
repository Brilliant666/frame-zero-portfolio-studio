import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from './schema.mjs';
import { authOptions } from './auth-options.mjs';

// Lazy factory: importing the module never connects to a database.
export function createAccountRuntime(config, client) {
  const pool = client ?? new Pool({ connectionString: config.databaseUrl, max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000 });
  // Idle connection failures must not terminate the application. Individual
  // queries still fail normally; readiness reports an unavailable dependency.
  if (!client) pool.on('error', () => { console.error('ACCOUNT_DATABASE_IDLE_ERROR'); });
  const db = drizzle(pool, { schema });
  const auth = betterAuth({ ...authOptions(config), database: drizzleAdapter(db, { provider: 'pg', schema, transaction: false }) });
  return { config, pool, db, auth };
}
