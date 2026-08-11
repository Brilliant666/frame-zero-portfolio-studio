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

function requestAdmin(pathname, { authenticated = false, host = "127.0.0.1:3001" } = {}) {
  const headers = { accept: "text/html", host };
  if (authenticated) headers["oai-authenticated-user-email"] = "owner@portfolio.example";
  return worker.fetch(
    new Request(`http://${host}${pathname}`, {
      headers,
      redirect: "manual",
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    context,
  );
}

async function withPhotoImportOrigin(value, operation) {
  const key = "FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN";
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return await operation();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

function renderAdmin(pathname, options, photoImportOrigin) {
  return withPhotoImportOrigin(photoImportOrigin, async () => {
    const response = await requestAdmin(pathname, options);
    const html = await response.text();
    return { response, html };
  });
}

test("/admin has an explicit template default", async () => {
  const response = await requestAdmin("/admin");
  assert.ok([307, 308].includes(response.status));
  assert.equal(new URL(response.headers.get("location"), "http://127.0.0.1:3001").pathname, "/admin/template");
});

for (const section of ["template", "profile", "packages", "layout", "contact", "advanced"]) {
  test(`/admin/${section} renders one focused Admin V2 task`, async () => {
    const { response, html } = await renderAdmin(`/admin/${section}`, undefined, undefined);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

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
      assert.equal(html.match(/data-template-material-profile="[^"]+"/g)?.length, 1);
      assert.equal(html.match(/data-template-composition-preview="[^"]+"/g)?.length, 1);
      assert.match(html, /data-preview-readonly="true"/);
      assert.doesNotMatch(html, /data-template-card=/);
      assert.match(html, /aria-label="正式页面模板"/);
      assert.match(html, /素材准备建议/);
      assert.match(html, /横图/);
      assert.match(html, /竖图/);
      assert.match(html, /方图/);
      assert.match(html, /当前素材排版预览/);
      assert.match(html, /正在为/);
      assert.match(html, /准备预览/);
    }
    if (section === "profile") {
      assert.equal(html.match(/data-optional-brand-content="true"/g)?.length, 1);
    }
    if (section === "packages") {
      assert.equal(html.match(/data-package-title-input="\d+"/g)?.length, 3);
    }
    if (section === "layout") {
      assert.match(html, /data-local-photo-import="missing"/);
      assert.match(html, /本地照片导入服务未启动/);
      assert.doesNotMatch(html, /data-photo-picker=|选择素材文件夹|\+ 添加照片|\+ 添加文件夹|高级 \/ 命令行导入|photos:import/);
      assert.match(html, /aria-label="素材库画幅统计"/);
    }
    assert.doesNotMatch(html, /admin-section-placeholder/);
  });
}

test("local Admin renders one folder ingest picker only for a strictly configured loopback origin", async () => {
  const { response, html } = await renderAdmin(
    "/admin/layout",
    undefined,
    "http://127.0.0.1:43127",
  );
  assert.equal(response.status, 200);
  assert.match(html, /data-local-photo-import="configured"/);
  assert.equal(html.match(/data-photo-picker="folder"/g)?.length, 1);
  assert.doesNotMatch(html, /data-photo-picker="files"/);
  assert.match(html, /data-photo-picker="folder"[^>]*webkitdirectory=""|webkitdirectory=""[^>]*data-photo-picker="folder"/);
  assert.match(html, /选择素材文件夹/);
  assert.doesNotMatch(html, /\+ 添加照片|\+ 添加文件夹|高级 \/ 命令行导入|photos:import/);
  assert.match(html, /刷新素材列表（不重新扫描文件夹）/);
  assert.match(html, /一次性读取/);
  assert.match(html, /后续增删需再次选择/);
  assert.doesNotMatch(html, /本地照片导入服务未启动/);
});

test("local Admin rejects malformed or non-loopback import origins", async (t) => {
  const invalidOrigins = [
    "https://127.0.0.1:43127",
    "http://localhost:43127",
    "http://0.0.0.0:43127",
    "http://192.168.1.25:43127",
    "http://127.0.0.1",
    "http://127.0.0.1:0",
    "http://127.0.0.1:65536",
    "http://user@127.0.0.1:43127",
    "http://127.0.0.1:43127/",
    "http://127.0.0.1:43127/path",
    "http://127.0.0.1:43127?query=1",
    "http://127.0.0.1:43127#fragment",
    " http://127.0.0.1:43127",
    "http://127.0.0.1:43127\n",
  ];

  for (const origin of invalidOrigins) {
    await t.test(JSON.stringify(origin), async () => {
      const { response, html } = await renderAdmin("/admin/layout", undefined, origin);
      assert.equal(response.status, 200);
      assert.match(html, /data-local-photo-import="missing"/);
      assert.doesNotMatch(html, /data-photo-picker=|选择素材文件夹|\+ 添加照片|\+ 添加文件夹|高级 \/ 命令行导入|photos:import/);
    });
  }
});

test("hosted Admin renders no executable local photo ingest controls", async () => {
  const { response, html } = await renderAdmin("/admin/layout", {
    authenticated: true,
    host: "portfolio.example.invalid",
  }, "http://127.0.0.1:43127");
  assert.equal(response.status, 200);
  assert.match(html, /data-local-photo-import="hosted"/);
  assert.match(html, /本地照片导入仅在本机编辑模式可用/);
  assert.doesNotMatch(html, /data-photo-picker=/);
  assert.doesNotMatch(html, /选择素材文件夹|\+ 添加照片|\+ 添加文件夹|高级 \/ 命令行导入|photos:import/);
  assert.match(html, /aria-label="保存全部修改"/);
});

test("a local-looking hosted hostname cannot enable the loopback controls", async () => {
  const { response, html } = await renderAdmin("/admin/layout", {
    authenticated: true,
    host: "localhost.example.invalid",
  }, "http://127.0.0.1:43127");
  assert.equal(response.status, 200);
  assert.match(html, /data-local-photo-import="hosted"/);
  assert.doesNotMatch(html, /data-photo-picker=|选择素材文件夹|\+ 添加照片|\+ 添加文件夹|高级 \/ 命令行导入|photos:import/);
});
