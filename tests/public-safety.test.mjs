import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/check-public-safety.mjs', import.meta.url));
const attributionAddress = ['noreply', 'anthropic.com'].join('@');

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'frame-zero-public-safety-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Safety fixture');
  git('config', 'user.email', 'safety@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(dir, 'README.md'), 'Anonymous safety fixture\n');
  git('add', 'README.md');
  return {
    dir, git,
    scan: () => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', timeout: 15_000 }),
  };
}

test('public automated attribution accepts GitHub trailer field casing', async t => {
  for (const field of ['Co-Authored-By', 'Co-authored-by', 'co-authored-by', 'CO-AUTHORED-BY']) {
    await t.test(field, t => {
      const f = fixture(t);
      f.git('commit', '-m', 'fixture', '-m', `${field}: Claude Code <${attributionAddress}>`);
      const result = f.scan();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Public repository safety check passed/);
    });
  }
});

test('trailer casing compatibility does not relax the exact public attribution value', async t => {
  for (const value of [`Other Name <${attributionAddress}>`, `Claude Code <${attributionAddress}> extra`, `Claude Code <${attributionAddress.toUpperCase()}>`]) {
    await t.test(value, t => {
      const f = fixture(t);
      f.git('commit', '-m', 'fixture', '-m', `Co-authored-by: ${value}`);
      assert.equal(f.scan().status, 1);
    });
  }
});

test('similar private addresses remain rejected in commit messages and candidate files', async t => {
  for (const email of [['person', 'anthropic.com'], ['noreply', 'anthropic.com.private.invalid'], ['private', 'example.org']].map(parts => parts.join('@'))) {
    await t.test(email, t => {
      const f = fixture(t);
      f.git('commit', '-m', `fixture ${email}`);
      assert.equal(f.scan().status, 1);
      writeFileSync(path.join(f.dir, 'contact.txt'), email);
      const result = f.scan();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /non-placeholder email/);
      assert.match(result.stderr, /tracked candidate contact.txt/);
    });
  }
});


test('the public address and exact trailer remain rejected in file content', t => {
  const f = fixture(t);
  f.git('commit', '-m', 'fixture');
  writeFileSync(path.join(f.dir, 'contact.txt'), `Co-Authored-By: Claude Code <${attributionAddress}>`);
  assert.equal(f.scan().status, 1, 'Untracked content is still scanned');
  f.git('add', 'contact.txt');
  assert.equal(f.scan().status, 1, 'Staged content is still scanned');
  f.git('commit', '-m', 'fixture content');
  f.git('rm', 'contact.txt');
  f.git('commit', '-m', 'fixture removal');
  const result = f.scan();
  assert.equal(result.status, 1, 'Deleted historical content is still scanned');
  assert.match(result.stderr, /reachable history content: non-placeholder email/);
});
