import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import sharp from 'sharp';
import { readAccountConfig } from '../scripts/lib/account-config.mjs';
import { createAccountRuntime } from '../db/accounts/runtime.mjs';
import { provisionAccount } from '../db/accounts/provision.mjs';
import { flowGalleryFullAdminBrowser, flowGalleryAdminMemoryLayout } from './flow-gallery-full-admin-browser.mjs';

const phase = process.argv[2];
assert.ok(['before', 'after', 'exercise', 'compare-before', 'compare-after'].includes(phase), 'Supply an explicit seed, comparison or exercise phase');
const config = readAccountConfig();
assert.equal(config.isTest, true);
assert.equal(new URL(config.databaseUrl).port, '55436', 'This local slice only uses the freshly allocated PG');
assert.equal(config.origin, 'http://127.0.0.1:3004');
const opsRoot = resolve(process.env.LOCALAPPDATA, 'PortfolioPlatform/local-m3/pr34-flow-admin-full-20261001');
assert.equal(dirname(resolve(process.env.FRAME_ZERO_SITE_ASSET_ROOT)), opsRoot, 'Use this slice dedicated asset directory');
const runId = process.argv[3];
if (runId !== undefined) {
  assert.match(runId, /^[a-z0-9][a-z0-9-]{0,63}$/, 'Run ID must be a plain directory name');
  assert.doesNotMatch(runId, /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/, 'Run ID cannot be a Windows device name');
}
const runRoot = runId ? join(opsRoot, 'runs', runId) : opsRoot;
const currentComparison = phase === 'compare-before' || phase === 'compare-after';
const evidenceTag = process.argv[4];
const layoutMode = process.argv[5];
if (layoutMode !== undefined) { assert.equal(layoutMode, 'layout'); assert.equal(phase, 'compare-after'); assert.ok(evidenceTag); }
if (evidenceTag !== undefined) {
  assert.ok(currentComparison, 'Evidence tag is only supported for read-only comparison');
  assert.match(evidenceTag, /^[a-z0-9][a-z0-9-]{0,63}$/, 'Evidence tag must be a plain directory name');
  assert.doesNotMatch(evidenceTag, /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/, 'Evidence tag cannot be a Windows device name');
  assert.notEqual(evidenceTag, 'current', 'Keep the original current comparison intact');
}
const outputDir = join(runRoot, currentComparison ? `evidence-${evidenceTag ?? 'current'}` : 'evidence');
const fixtureFile = join(runRoot, 'fixture.local.json');
const runtime = createAccountRuntime(config);
const space = 'premium-flow-gallery';
let fixture;
try {
  if (phase === 'before') {
    // Never reuse or overwrite even this slice's previous anonymous fixture.
    await assert.rejects(readFile(fixtureFile), error => error.code === 'ENOENT', 'Before fixture already exists');
    const fixtureSlug = `flowfull${Date.now().toString(36)}`;
    const password = `Anonymous-fixture-${randomUUID()}`;
    const account = await provisionAccount(runtime, { username: fixtureSlug, slug: fixtureSlug, email: `${fixtureSlug}@example.invalid`, password, premium: false });
    assert.equal(account.status, 'CREATED');
    await runtime.pool.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,$3,'operator-test')", [randomUUID(), account.siteId, space]);
    fixture = { fixtureSlug, siteId: account.siteId, password, baseline: null };
    await mkdir(runRoot, { recursive: true });
    await writeFile(fixtureFile, JSON.stringify(fixture), { flag: 'wx' });
    const login = await fetch(`${config.origin}/api/auth/sign-in/username`, { method: 'POST', headers: { origin: config.origin, 'content-type': 'application/json' }, body: JSON.stringify({ username: fixtureSlug, password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const headers = { origin: config.origin, cookie };
    const api = async (path, body, status = 200, method = 'POST') => {
      const response = await fetch(`${config.origin}${path}`, { method, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, status, 'Anonymous fixture seed operation succeeded'); return response.json();
    };
    const assets = [];
    for (let index = 0; index < 50; index++) {
      const [width, height] = [[720, 480], [480, 720], [600, 600]][index % 3];
      const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="hsl(${index * 37 % 360} 25% 42%)"/><circle cx="${width * .55}" cy="${height * .32}" r="${width * .15}" fill="white" opacity=".15"/><text x="50%" y="54%" text-anchor="middle" fill="white" font-size="60" font-family="sans-serif">${String(index + 1).padStart(2, '0')}</text></svg>`;
      const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
      const response = await fetch(`${config.origin}/api/sites/${fixtureSlug}/assets`, { method: 'POST', headers: { ...headers, 'content-type': 'image/png', 'x-file-name': `anonymous-${index + 1}.png` }, body: buffer, signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 201);
      const asset = (await response.json()).asset;
      assets.push(asset.id);
      await runtime.pool.query('UPDATE site_assets SET created_at=$1 WHERE site_id=$2 AND id=$3', [new Date(Date.UTC(2026, 0, index + 1)), account.siteId, asset.id]);
    }
    const left = randomUUID(), right = randomUUID(), hidden = randomUUID();
    const content = {
      schemaVersion: 1,
      profile: { brand: '匿名流影工作室', title: '午后作品画廊', intro: '同一匿名数据，用于本次完整后台界面与操作验收。' },
      background: { assetId: assets[0], focalPoint: { x: 50, y: 50 } },
      groups: [
        { id: left, name: '午后的光', assetIds: assets.slice(0, 6), captions: { [assets[0]]: '匿名照片说明' }, visible: true },
        { id: right, name: '人物与片刻', assetIds: assets.slice(6, 12), captions: {}, visible: true },
        { id: hidden, name: '练习存档', assetIds: assets.slice(12, 15), captions: {}, visible: false },
      ],
      rails: { leftGroupId: left, rightGroupId: right, leftWidthPercent: 70 },
      pricing: { enabled: true, heading: '价格与活动', introduction: '项目与交付说明', packages: [{ id: randomUUID(), name: '匿名肖像拍摄', price: '测试价格 100', description: '一小时拍摄', details: ['匿名测试用途', '交付十张照片'], enabled: true }] },
      contact: { enabled: true, heading: '联系约拍', intro: '文字联系可独立使用，不要求二维码。', items: [{ id: randomUUID(), label: '邮箱', value: 'flow@example.invalid', href: 'mailto:flow@example.invalid' }] },
    };
    const draftPath = `/api/sites/${fixtureSlug}/drafts/${space}`;
    const saved = await api(draftPath, { content, expectedRevision: 0 }, 200, 'PUT');
    await api(`/api/sites/${fixtureSlug}/publications/${space}`, { action: 'publish', expectedDraftRevision: saved.revision, expectedPublicationId: null });
    const privateContent = structuredClone(content);
    privateContent.profile.intro = '已保存草稿与当前公开版本不同，用于独立状态验收。';
    await api(draftPath, { content: privateContent, expectedRevision: saved.revision }, 200, 'PUT');
    console.log(`[flow-full-admin] Created anonymous fixture ${fixtureSlug} Site ${account.siteId}, 50 assets; no credentials emitted`);
  } else {
    fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
    assert.ok(fixture.baseline, 'After needs successful before baseline');
  }
  const browserPhase = phase === 'compare-before' ? 'before' : phase === 'compare-after' ? 'after' : phase;
  if (currentComparison) await assert.rejects(readFile(join(outputDir, browserPhase, 'acceptance.json')), error => error.code === 'ENOENT', 'Current comparison evidence already exists; refuse overwrite');
  const comparisonBaseline = evidenceTag ? fixture.comparisonBaselines?.[evidenceTag] : fixture.currentBaseline;
  if (phase === 'compare-after') assert.ok(comparisonBaseline, 'Current comparison requires compare-before for the same tag');
  const report = await flowGalleryFullAdminBrowser({ runtime, origin: config.origin, password: fixture.password, fixtureSlug: fixture.fixtureSlug, siteId: fixture.siteId, phase: browserPhase, outputDir, expectedBaseline: phase === 'compare-after' ? comparisonBaseline : phase === 'after' ? fixture.baseline : undefined });
  if (phase === 'before') { fixture.baseline = report.baseline; await writeFile(fixtureFile, JSON.stringify(fixture)); }
  if (phase === 'compare-before') {
    if (evidenceTag) { fixture.comparisonBaselines ??= {}; fixture.comparisonBaselines[evidenceTag] = report.baseline; }
    else fixture.currentBaseline = report.baseline;
    await writeFile(fixtureFile, JSON.stringify(fixture));
  }
  console.log(`[flow-full-admin] ${phase}: ${report.checkpoints.length} checkpoints passed; evidence ${join(outputDir, browserPhase)}`);
  if (phase === 'after' || phase === 'compare-after') {
    const labels = { library: '图库', groups: '完整作品', home: '首页', pricing: '价格与活动', contact: '联系' };
    const panels = Object.entries(labels).map(([key, label]) => `<section id="${key}"><h2>${label}</h2>${[1440, 390].map(width => `<div class="pair" data-width="${width}"><figure><figcaption>修改前 · ${width === 1440 ? '1440 × 900' : '390 × 844'}</figcaption><img src="before/${width}-${key}.png" alt="${label}修改前，${width}像素视口" /></figure><figure><figcaption>修改后 · 相同视口与相同数据</figcaption><img src="after/${width}-${key}.png" alt="${label}修改后，${width}像素视口" /></figure></div>`).join('')}</section>`).join('');
    await writeFile(join(outputDir, 'comparison.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>流影视廊完整后台 · 同数据对照</title><style>body{margin:0;background:#eef1ed;color:#203b32;font:16px/1.6 system-ui,sans-serif}header{position:sticky;top:0;padding:16px 24px;background:#fff;border-bottom:1px solid #d1d9d0;z-index:1}h1{font-size:24px;margin:0}p{margin:6px 0}nav{display:flex;gap:20px;flex-wrap:wrap}a{color:#275c49}main{padding:20px;max-width:1800px;margin:auto}h2{scroll-margin-top:190px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:40px}.pair[data-width="390"]{max-width:820px;margin:auto auto 40px}figure{margin:0;background:white;border:1px solid #cad5c9;padding:10px}img{display:block;width:100%;height:auto}figcaption{font-weight:600;padding:6px}body[data-device="desktop"] .pair[data-width="390"],body[data-device="mobile"] .pair[data-width="1440"]{display:none}button{padding:9px 16px;margin:8px 8px 8px 0;border:1px solid #95aa99;background:white;color:inherit;cursor:pointer}button[aria-pressed="true"]{background:#275c49;color:#fff}small{color:#536458}</style><body data-device="desktop"><header><h1>流影视廊完整后台 · 同数据对照</h1><p>隔离数据库、同一匿名 Site、${report.dataset.assetCount} 张素材、草稿 v${report.dataset.draftRevision} 与公开 v${report.dataset.publishedDraftRevision}。三份数据摘要核对一致。</p><nav>${Object.entries(labels).map(([key, label]) => `<a href="#${key}">${label}</a>`).join('')}</nav><button type="button" data-device="desktop" aria-pressed="true">桌面 1440 × 900</button><button type="button" data-device="mobile" aria-pressed="false">手机 390 × 844</button><small>截图时未执行业务写入。手机为浏览器模拟视口；几何报告分别记录照片绘制、祖先裁剪和保存栏遮挡。</small></header><main>${panels}</main><script>document.querySelectorAll('button[data-device]').forEach(button=>button.addEventListener('click',()=>{document.body.dataset.device=button.dataset.device;document.querySelectorAll('button[data-device]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)))}));</script></body></html>`);
    console.log(`[flow-full-admin] Same-data comparison ${join(outputDir, 'comparison.html')}`);
    if (layoutMode === 'layout') {
      const layout = await flowGalleryAdminMemoryLayout({ runtime, origin: config.origin, password: fixture.password, fixtureSlug: fixture.fixtureSlug, siteId: fixture.siteId, outputDir });
      console.log(`[flow-full-admin] Memory-only layout: ${layout.scenarios.length} scenarios passed; no persisted business writes`);
    }
    if (phase === 'after') {
      const exercise = await flowGalleryFullAdminBrowser({ runtime, origin: config.origin, password: fixture.password, fixtureSlug: fixture.fixtureSlug, siteId: fixture.siteId, phase: 'exercise', outputDir });
      console.log(`[flow-full-admin] exercise: ${exercise.checkpoints.length} checkpoints passed; evidence ${outputDir}`);
    }
  }
} finally { await runtime.pool.end(); }
