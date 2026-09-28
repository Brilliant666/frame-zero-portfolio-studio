import { readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readAccountConfig } from './lib/account-config.mjs';
import { loadSiteContentSchema } from './lib/load-site-schema.mjs';
import { legacyImportSourceGate, assertLegacyOperatorApplyAllowed } from './lib/legacy-import-source-gate.mjs';
import { createAccountRuntime } from '../db/accounts/runtime.mjs';
import { assetRoot } from '../db/accounts/assets.mjs';
import { exportLegacySnapshot, planLegacyImport, applyLegacyImport, verifyLegacySourceUnchanged, preflightLegacyImport, verifyApprovedOmissionsMissing } from '../db/accounts/legacy-import.mjs';

// Config and reports contain private paths/content. Keep both outside Git.
// node --env-file=.env.accounts.local scripts/site-legacy-import.mjs <export|dry-run|apply> <local-config.json> [--mode=display-acceptance]
let runtime, schema;
try {
  const [operation, filename, option, ...extra] = process.argv.slice(2);
  if (!['export', 'dry-run', 'apply'].includes(operation) || !filename || extra.length || (option !== undefined && !['--mode=complete', '--mode=display-acceptance'].includes(option))) throw new Error('INVALID_ARGUMENTS');
  const mode = option?.slice('--mode='.length) ?? 'complete';
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
    if (config.approvedBasicOmissions && mode !== 'display-acceptance') throw new Error('OMISSIONS_REQUIRE_DISPLAY_ACCEPTANCE');
    const plan = planLegacyImport({ snapshot, siteId: config.siteId, siteSlug: 'star', previousPlan, approvedBasicOmissions: config.approvedBasicOmissions });
    await verifyApprovedOmissionsMissing({ plan, photosRoot: config.photosRoot });
    if (!previousPlan) await writeFile(planFile, JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
    schema = await loadSiteContentSchema();
    let preflight, blocked;
    try { preflight = await preflightLegacyImport({ db: runtime.pool, plan, snapshotRoot: destination, validateContent: schema.parseSpaceContent }); }
    catch (error) { blocked = /^[A-Z_]+$/.test(error.message) ? error.message : 'PREFLIGHT_FAILED'; }
    const sourceGate = legacyImportSourceGate(plan, mode);
    const displayVerified = mode === 'display-acceptance' && sourceGate.displayReady;
    const status = blocked ? 'BLOCKED_PREFLIGHT' : displayVerified ? 'DISPLAY_DRY_RUN_VERIFIED' : sourceGate.complete ? 'DRY_RUN_VERIFIED' : 'PARTIAL_SOURCE';
    const report = { status, mode, originalArchive: sourceGate.originalArchive, sourceFingerprint: snapshot.fingerprint, siteId: plan.siteId, spaces: plan.sourceEvidence, mapping: plan.mapping, newAssets: preflight?.alreadyImported ? 0 : plan.assets.length, legacyDerivedOnly: plan.assets.filter(a => a.provenance === 'legacy-derived-only').length, originalSourceStatus: sourceGate.originalSourceStatus, missingOriginals: sourceGate.complete ? 'Originals mapped in plan; preflight validates their evidence.' : displayVerified ? 'Display derivatives only; originals unavailable/not-mapped and original archive INCOMPLETE. No original is synthesized.' : 'No originals claimed; complete-mode apply is blocked until external original mappings are confirmed.', unresolved: [...(blocked ? [blocked] : []), ...sourceGate.unresolved] };
    report.approvedBasicOmissions = plan.approvedBasicOmissions ?? [];
    await writeFile(path.join(destination, `report-${Date.now()}.json`), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    if (blocked) throw new Error('PREFLIGHT_BLOCKED');
    if (operation === 'apply') {
      assertLegacyOperatorApplyAllowed(sourceGate);
      // Never apply an outdated snapshot while the old editor has moved on.
      await verifyLegacySourceUnchanged({ ...config, snapshot });
      const result = await applyLegacyImport({ pool: runtime.pool, plan, snapshotRoot: destination, privateRoot: assetRoot(), validateContent: schema.parseSpaceContent, operatorMode: mode });
      console.log(`接入结果：${result.status}；模式 ${mode}；原图归档 ${sourceGate.originalArchive}；仅保存私人草稿，未发布，旧源未修改。`);
    } else console.log(displayVerified ? '展示资源 dry-run 已验证；原图归档仍为 INCOMPLETE（如有缺失）；所有权、空目标及文件验证均已执行，尚未写入内容或资源。' : sourceGate.complete ? 'dry-run 已验证；映射与报告已保存在本机备份目录，尚未写入内容或资源。' : 'dry-run 为 PARTIAL_SOURCE：原图映射尚未确认，完整模式 apply 已阻断；部分来源报告已保存在本机备份目录，尚未写入内容或资源。');
  }
} catch {
  // Upstream DB/filesystem messages may contain credentials or private paths.
  console.error('本机接入未完成。请核对本机配置、来源备份、目标身份、内容冲突与报告；旧源未被覆盖。');
  process.exitCode = 1;
} finally { await schema?.dispose(); await runtime?.pool.end(); }
