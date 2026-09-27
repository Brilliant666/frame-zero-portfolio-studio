import { readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readAccountConfig } from './lib/account-config.mjs';
import { loadSiteContentSchema } from './lib/load-site-schema.mjs';
import { createAccountRuntime } from '../db/accounts/runtime.mjs';
import { assetRoot } from '../db/accounts/assets.mjs';
import { exportLegacySnapshot, planLegacyImport, applyLegacyImport, verifyLegacySourceUnchanged, preflightLegacyImport } from '../db/accounts/legacy-import.mjs';

// Config and reports contain private paths/content. Keep both outside Git.
// node --env-file=.env.accounts.local scripts/site-legacy-import.mjs <export|dry-run|apply> <local-config.json>
let runtime, schema;
try {
  const [operation, filename, ...extra] = process.argv.slice(2);
  if (!['export', 'dry-run', 'apply'].includes(operation) || !filename || extra.length) throw new Error('INVALID_ARGUMENTS');
  const config = JSON.parse(await readFile(filename, 'utf8'));
  if (config.siteSlug !== 'star' || config.confirmSourceOwner !== 'star' || !path.isAbsolute(config.snapshotRoot)) throw new Error('EXPLICIT_STAR_SOURCE_REQUIRED');
  const repository = await realpath(new URL('..', import.meta.url));
  const destination = path.resolve(config.snapshotRoot);
  if (destination === repository || destination.startsWith(`${repository}${path.sep}`)) throw new Error('BACKUP_MUST_BE_OUTSIDE_REPOSITORY');
  if (operation === 'export') {
    const snapshot = await exportLegacySnapshot({ ...config, outputDirectory: destination });
    console.log(`备份已完成：2 个独立内容空间、${snapshot.assets.length} 个资源；仅保留已有字节，未迁移。`);
  } else {
    const accountConfig = readAccountConfig();
    if (accountConfig.isTest) throw new Error('REAL_OPERATOR_COMMAND_REJECTS_CI_DATABASE');
    runtime = createAccountRuntime(accountConfig);
    const target = await runtime.pool.query(`SELECT s.id FROM sites s JOIN portfolio_users p ON p.id=s.owner_id JOIN account_provisioning op ON op.id=p.provisioning_id
      WHERE s.id=$1::uuid AND s.slug='star' AND op.username='star' AND op.completed_at IS NOT NULL`, [config.siteId]);
    if (target.rowCount !== 1) throw new Error('STAR_TARGET_NOT_CONFIRMED');
    const snapshot = JSON.parse(await readFile(path.join(destination, 'snapshot.json'), 'utf8'));
    const planFile = path.join(destination, 'import-plan.json');
    let previousPlan;
    try { previousPlan = JSON.parse(await readFile(planFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const plan = planLegacyImport({ snapshot, siteId: config.siteId, siteSlug: 'star', previousPlan });
    if (!previousPlan) await writeFile(planFile, JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
    schema = await loadSiteContentSchema();
    let preflight, blocked;
    try { preflight = await preflightLegacyImport({ db: runtime.pool, plan, snapshotRoot: destination, validateContent: schema.parseSpaceContent }); }
    catch (error) { blocked = /^[A-Z_]+$/.test(error.message) ? error.message : 'PREFLIGHT_FAILED'; }
    const report = { status: blocked ? 'BLOCKED_PREFLIGHT' : 'DRY_RUN_VERIFIED', sourceFingerprint: snapshot.fingerprint, siteId: plan.siteId, spaces: plan.sourceEvidence, mapping: plan.mapping, newAssets: preflight?.alreadyImported ? 0 : plan.assets.length, legacyDerivedOnly: plan.assets.filter(a => a.provenance === 'legacy-derived-only').length, originalSourceStatus: 'UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST', missingOriginals: 'No originals claimed; only existing derivatives verified byte for byte. Confirm external original catalog before claiming complete original preservation.', unresolved: blocked ? [blocked] : [] };
    await writeFile(path.join(destination, `report-${Date.now()}.json`), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    if (blocked) throw new Error('PREFLIGHT_BLOCKED');
    if (operation === 'apply') {
      // Never apply an outdated snapshot while the old editor has moved on.
      await verifyLegacySourceUnchanged({ ...config, snapshot });
      const result = await applyLegacyImport({ pool: runtime.pool, plan, snapshotRoot: destination, privateRoot: assetRoot(), validateContent: schema.parseSpaceContent });
      console.log(`接入结果：${result.status}；仅保存私人草稿，未发布，旧源未修改。`);
    } else console.log('dry-run 已验证；映射与报告已保存在本机备份目录，尚未写入内容或资源。');
  }
} catch {
  // Upstream DB/filesystem messages may contain credentials or private paths.
  console.error('本机接入未完成。请核对本机配置、来源备份、目标身份、内容冲突与报告；旧源未被覆盖。');
  process.exitCode = 1;
} finally { await schema?.dispose(); await runtime?.pool.end(); }
