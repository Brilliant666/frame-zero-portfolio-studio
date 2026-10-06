import assert from 'node:assert/strict';

/** Read only an already-loaded anonymous fixture. The caller obtains expected
 * values from its immutable Published snapshot, never the in-memory editor. */
export async function assertPublishedMetadata(page, { origin, snapshot }) {
  const profile = snapshot.content.profile;
  const brand = profile.brand.trim() || '摄影作品集';
  assert.equal(new URL(page.url()).pathname, `/${snapshot.slug}`);
  const content = async selector => {
    const element = page.locator(selector);
    await element.waitFor({ state: 'attached' });
    assert.equal(await element.count(), 1, `Metadata ${selector} must not inherit a competing root value`);
    return element.getAttribute('content');
  };
  await page.waitForFunction(expected => document.title === expected, brand);
  assert.equal(await content('meta[property="og:title"]'), brand);
  assert.equal(await content('meta[property="og:site_name"]'), brand);
  assert.equal(await content('meta[property="og:url"]'), `${origin}/${snapshot.slug}`);
  assert.equal(await content('meta[property="og:description"]'), profile.intro);
  assert.equal(await content('meta[name="twitter:title"]'), brand);
  const images = page.locator('meta[property="og:image"]');
  const imageCount = await images.count();
  const chosen = snapshot.content.background.assetId ?? snapshot.content.groups.filter(group => group.visible).flatMap(group => group.assetIds).find(id => snapshot.assetIds.includes(id));
  if (chosen) {
    assert.equal(imageCount, 1);
    const expected = `${origin}/api/public-sites/${snapshot.slug}/assets/${chosen}/card`;
    assert.equal(await images.getAttribute('content'), expected);
    assert.equal(await content('meta[name="twitter:image"]'), expected);
    assert.equal(await content('meta[name="twitter:card"]'), 'summary_large_image');
  } else {
    assert.equal(imageCount, 0);
    assert.equal(await page.locator('meta[name="twitter:image"]').count(), 0);
    assert.equal(await content('meta[name="twitter:card"]'), 'summary');
  }
  return { title: brand, siteName: brand, url: `${origin}/${snapshot.slug}`, imageCount, source: 'immutable Published snapshot' };
}
