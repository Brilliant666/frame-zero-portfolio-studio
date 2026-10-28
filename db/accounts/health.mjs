import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { assetRoot } from './assets.mjs';

const schemaProbe = `SELECT
  to_regclass('public."user"') IS NOT NULL
  AND to_regclass('public.session') IS NOT NULL
  AND to_regclass('public.account_provisioning') IS NOT NULL
  AND to_regclass('public.portfolio_users') IS NOT NULL
  AND to_regclass('public.site_template_grants') IS NOT NULL
  AND to_regclass('public.sites') IS NOT NULL
  AND to_regclass('public.site_assets') IS NOT NULL
  AND to_regclass('public.site_content_drafts') IS NOT NULL
  AND to_regclass('public.site_publication_revisions') IS NOT NULL
  AND to_regclass('public.site_publications') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication)) AS ready`;

// A read-only dependency probe, never a migration, permission repair, or write.
export async function checkRuntimeReadiness(runtime, { timeoutMs = 1500, filesystem = { access, realpath, stat } } = {}) {
  let timer;
  try {
    const root = assetRoot(runtime.config.assetRoot);
    const probe = Promise.all([
      runtime.pool.query({ text: schemaProbe, query_timeout: Math.min(1000, timeoutMs) }),
      (async () => {
        const canonical = assetRoot(await filesystem.realpath(root));
        const metadata = await filesystem.stat(canonical);
        if (!metadata.isDirectory()) return false;
        await filesystem.access(canonical, constants.R_OK | constants.W_OK | constants.X_OK);
        return true;
      })(),
    ]).then(([result, assetsReady]) => result.rows?.[0]?.ready === true && assetsReady);
    return (await Promise.race([probe, new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })])) === true;
  } catch { return false; }
  finally { clearTimeout(timer); }
}
