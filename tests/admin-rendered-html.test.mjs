import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./cloudflare-loader.mjs", import.meta.url));

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("admin-html-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

function requestAdmin(pathname) {
  return worker.fetch(
    new Request(`http://127.0.0.1:3001${pathname}`, {
      headers: { accept: "text/html", host: "127.0.0.1:3001" },
      redirect: "manual",
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    context,
  );
}

test("/admin has an explicit template default", async () => {
  const response = await requestAdmin("/admin");
  assert.ok([307, 308].includes(response.status));
  assert.equal(new URL(response.headers.get("location"), "http://127.0.0.1:3001").pathname, "/admin/template");
});

for (const section of ["template", "profile", "packages", "layout", "contact", "advanced"]) {
  test(`/admin/${section} renders one focused Admin V2 task`, async () => {
    const response = await requestAdmin(`/admin/${section}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();

    assert.match(html, /<title>内容管理后台<\/title>/);
    assert.match(html, /<meta property="og:title" content="内容管理后台"\/>/);
    assert.match(html, /<meta property="og:site_name" content="内容管理后台"\/>/);
    assert.match(html, /<meta name="twitter:title" content="内容管理后台"\/>/);
    assert.match(html, /<link rel="icon" href="(?:https?:\/\/[^\"]+)?\/favicon\.svg"\/>/);
    assert.match(html, /aria-label="保存全部修改"/);
    assert.match(html, /title="保存全部修改"/);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.equal(html.match(/data-admin-section="[^"]+"/g)?.length, 1);
    assert.match(html, new RegExp(`data-admin-section="${section}"`));
    assert.match(html, new RegExp(`href="/admin/${section}"[^>]*aria-current="page"|aria-current="page"[^>]*href="/admin/${section}"`));
    for (const href of ["template", "profile", "packages", "layout", "contact", "advanced"]) {
      assert.match(html, new RegExp(`href="/admin/${href}"`));
    }
    if (section === "template") {
      assert.equal(html.match(/data-template-option="[^"]+"/g)?.length, 11);
      assert.equal(html.match(/data-template-detail="[^"]+"/g)?.length, 1);
      assert.equal(html.match(/data-template-mobile-selector="true"/g)?.length, 1);
      assert.doesNotMatch(html, /data-template-card=/);
      assert.match(html, /aria-label="正式页面模板"/);
    }
    if (section === "profile") {
      assert.equal(html.match(/data-optional-brand-content="true"/g)?.length, 1);
    }
    if (section === "packages") {
      assert.equal(html.match(/data-package-title-input="\d+"/g)?.length, 3);
    }
    assert.doesNotMatch(html, /admin-section-placeholder/);
  });
}
