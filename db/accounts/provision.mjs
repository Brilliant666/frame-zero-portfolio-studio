import { randomUUID } from 'node:crypto';
import { createAccountRuntime } from './runtime.mjs';
import { isSiteSlug } from './site-slug.mjs';

export function normalizeProvisionInput(input) {
  const username = String(input.username ?? '').trim().toLowerCase();
  const slug = String(input.slug ?? '').trim().toLowerCase();
  const email = String(input.email ?? '').trim().toLowerCase();
  if (![username,slug].every(isSiteSlug)) throw new Error('INVALID_USERNAME_OR_SLUG');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_EMAIL');
  if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) throw new Error('INVALID_PASSWORD_LENGTH');
  return { username, slug, email, password: input.password, premium: input.premium === true };
}

export async function provisionAccount(runtime, input, { afterAuth = async () => {} } = {}) {
  const data = normalizeProvisionInput(input);
  const client = await runtime.pool.connect();
  try {
    // Serialize operator provisioning, including different identities with colliding email/slug.
    await client.query('SELECT pg_advisory_lock(73026101)');
    let op = (await client.query('SELECT * FROM account_provisioning WHERE username=$1 OR email=$2 OR slug=$3', [data.username,data.email,data.slug])).rows;
    if (op.length && (op.length !== 1 || op[0].username !== data.username || op[0].email !== data.email || op[0].slug !== data.slug || op[0].premium !== data.premium)) throw new Error('PROVISION_CONFLICT');
    if (!op.length) {
      const existing = await client.query('SELECT id FROM "user" WHERE lower(email)=$1 OR lower(username)=$2', [data.email,data.username]);
      if (existing.rowCount) throw new Error('EXISTING_AUTH_IDENTITY_NOT_OWNED');
      op = (await client.query('INSERT INTO account_provisioning (id,username,email,slug,premium) VALUES ($1,$2,$3,$4,$5) RETURNING *', [randomUUID(),data.username,data.email,data.slug,data.premium])).rows;
    }
    const intent = op[0];
    if (intent.completed_at) return { status: 'ALREADY_EXISTS', operationId: intent.id };
    // Auth API and business writes share this PostgreSQL transaction/client. The durable
    // intent remains on rollback; no half-created credentials are committed.
    await client.query('BEGIN');
    const txRuntime = createAccountRuntime(runtime.config, client);
    const { user } = await txRuntime.auth.api.createUser({ body: {
      email: data.email, password: data.password, name: data.username, role: 'user',
      data: { username: data.username, displayUsername: data.username, provisioningId: intent.id, emailVerified: false },
    } });
    await afterAuth();
    const ownerId = randomUUID(), siteId = randomUUID();
    await client.query('INSERT INTO portfolio_users (id,auth_user_id,provisioning_id) VALUES ($1,$2,$3)', [ownerId,user.id,intent.id]);
    await client.query('INSERT INTO sites (id,slug,owner_id) VALUES ($1,$2,$3)', [siteId,data.slug,ownerId]);
    if (data.premium) await client.query("INSERT INTO site_template_grants (id,site_id,product,source) VALUES ($1,$2,'premium-polaroid','operator-test')", [randomUUID(),siteId]);
    await client.query('UPDATE account_provisioning SET completed_at=now() WHERE id=$1', [intent.id]);
    await client.query('COMMIT');
    return { status: 'CREATED', operationId: intent.id, siteId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    // Never forward upstream DB errors (which can contain emails or connection details).
    if (['PROVISION_CONFLICT','EXISTING_AUTH_IDENTITY_NOT_OWNED'].includes(error?.message)) throw error;
    throw new Error('PROVISION_FAILED_RETRY_SAME_INPUT');
  } finally {
    await client.query('SELECT pg_advisory_unlock(73026101)').catch(() => {});
    client.release();
  }
}
