/** Local-only identity configuration. Never include input values in errors. */
export function readAccountConfig(env = process.env) {
  if (env.FRAME_ZERO_LOCAL_ACCOUNTS !== "1") {
    throw new Error("Local accounts are not enabled.");
  }
  let database;
  try {
    database = new URL(env.FRAME_ZERO_ACCOUNT_DATABASE_URL);
  } catch {
    throw new Error("Invalid local account database configuration.");
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    !database.username || !database.password || database.search || database.hash ||
    !["/frame_zero_accounts", "/frame_zero_accounts_test"].includes(database.pathname)
  ) {
    throw new Error("Account database must be a dedicated loopback PostgreSQL database.");
  }
  const isTest = database.pathname === "/frame_zero_accounts_test";
  const origin = env.FRAME_ZERO_ACCOUNT_ORIGIN;
  if (origin !== `http://127.0.0.1:${isTest ? 3004 : 3003}`) {
    throw new Error("Account origin must match the dedicated local Node environment.");
  }
  const secret = env.FRAME_ZERO_ACCOUNT_SECRET;
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Account secret must contain at least 32 characters.");
  }
  return { databaseUrl: database.href, secret, origin, isTest };
}
