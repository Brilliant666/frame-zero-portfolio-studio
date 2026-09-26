import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const directory = new URL('public/fonts/noto-serif-sc-900/', root);
const css = await readFile(new URL('app/templates/polaroid-field/motion-fonts.css', root), 'utf8');
const sources = JSON.parse(await readFile(new URL('sources.json', directory), 'utf8'));
const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);

test('preview title font uses all 101 local weight-900 unicode-range slices', async () => {
  assert.equal(faces.length, 101);
  assert.equal(sources.files.length, 101);
  assert.doesNotMatch(css, /https?:\/\//);
  const seen = new Set();
  for (const face of faces) {
    assert.match(face, /font-family:\s*'Noto Serif SC'/);
    assert.match(face, /font-weight:\s*900\s*;/);
    assert.match(face, /font-display:\s*swap\s*;/);
    assert.match(face, /unicode-range:\s*U\+/);
    const match = face.match(/url\(\/fonts\/noto-serif-sc-900\/(subset-\d{3}\.woff2)\)/);
    assert.ok(match, 'Every source is an exact local font path');
    assert.equal(seen.has(match[1]), false);
    seen.add(match[1]);
    const bytes = await readFile(new URL(match[1], directory));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'wOF2');
    const provenance = sources.files.find((file) => file.file === match[1]);
    assert.ok(provenance);
    assert.equal(bytes.length, provenance.bytes);
    assert.equal(provenance.sha256Chunks.length, 8);
    for (const chunk of provenance.sha256Chunks) assert.match(chunk, /^[a-f0-9]{8}$/);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.sha256Chunks.join(''));
  }
});

test('preview title coverage is not restricted to the current headings', () => {
  const covered = new Set();
  for (const face of faces) {
    const ranges = face.match(/unicode-range:\s*([^;]+);/)[1];
    for (const token of ranges.split(',')) {
      const [start, end = start] = token.trim().replace(/^U\+/i, '').split('-').map((hex) => Number.parseInt(hex, 16));
      assert.ok(Number.isFinite(start) && Number.isFinite(end));
      for (let code = start; code <= end; code++) covered.add(code);
    }
  }
  assert.ok(covered.size > 13000);
  for (const character of '星空正片创作漫展场照摄影作品集后台新增汉字测试龘龖麤鬱彧璟曦') {
    assert.ok(covered.has(character.codePointAt(0)), `Missing newly editable character ${character}`);
  }
});

test('official OFL and exact font paths ship without broadening public allowlist', async () => {
  const license = await readFile(new URL('OFL.txt', directory), 'utf8');
  assert.match(license, /Copyright 2012 Google Inc/);
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
  const manifest = JSON.parse(await readFile(new URL('config/production-public-files.json', root), 'utf8'));
  assert.ok(manifest.files.length <= 256);
  assert.deepEqual(manifest.files.filter((file) => file.startsWith('fonts/')), [
    'fonts/noto-serif-sc-900/OFL.txt',
    ...Array.from({ length: 101 }, (_, index) => `fonts/noto-serif-sc-900/subset-${String(index).padStart(3, '0')}.woff2`),
  ]);
  for (const file of sources.files) assert.ok(manifest.files.includes(`fonts/noto-serif-sc-900/${file.file}`));
  assert.ok(manifest.files.includes('fonts/noto-serif-sc-900/OFL.txt'));
  assert.ok(!manifest.files.includes('fonts/noto-serif-sc-900/sources.json'));
  assert.ok(!manifest.files.includes('fonts/noto-serif-sc-900/README.md'));
});
