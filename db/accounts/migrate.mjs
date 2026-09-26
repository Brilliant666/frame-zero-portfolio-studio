import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

export async function migrateAccounts(config) {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 3000 });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(73026102)');
    await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../../drizzle-accounts', import.meta.url)) });
  } finally {
    await client.query('SELECT pg_advisory_unlock(73026102)').catch(() => {});
    client.release(); await pool.end();
  }
}
