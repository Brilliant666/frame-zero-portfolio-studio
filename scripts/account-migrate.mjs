import { readAccountConfig } from './lib/account-config.mjs';
import { migrateAccounts } from '../db/accounts/migrate.mjs';
try {
  await migrateAccounts(readAccountConfig());
  console.log('Local account migrations applied (replay is a no-op).');
} catch { console.error('Account migration failed. Check local configuration and PostgreSQL; no credentials logged.'); process.exitCode = 1; }
