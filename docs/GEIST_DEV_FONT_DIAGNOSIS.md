# Geist 开发环境字体路径诊断

日期：2026-09-25。范围：只诊断；没有修改原版模板、`app/layout.tsx`、字体设置或依赖。

## 结论

- **通过（原因查明）**：这是当前 Windows 上 `vinext@0.0.50` Google Fonts 插件的路径分隔符不一致，不是字体文件丢失，也不是思源宋体设置引起。
- **未修复（按本轮范围保留）**：开发响应仍带本机磁盘地址；浏览器不能从 HTTP 页面加载这些字体。
- **通过（正式构建）**：当前 `npm run build` 使用 Next.js，而不是 vinext。现有 Next standalone 构建的 11 个 Geist 字体地址均为同源 `/_next/static/media/*.woff2`，HTTP 返回 200、`Content-Type: font/woff2`；没有 Windows 磁盘地址。

## 本地源码证据

`node_modules/vinext/dist/plugins/fonts.js`：

1. 第 416 行：`path.join(config.root, ".vinext", "fonts")` 在 Windows 生成反斜杠 `cacheDir`。
2. 第 305 行：缓存 CSS 使用 `filePath.replaceAll("\\", "/")`，将字体路径写为正斜杠的磁盘绝对路径，尾部为 `.vinext/fonts/...`。
3. 第 89–92 行：`_rewriteCachedFontCssToServedUrls` 直接做 `css.includes(cacheDir)` 和 `css.split(cacheDir)`，没有统一分隔符。
4. 第 537 行：调用上述重写函数，然后把未替换的 CSS 注入 `_selfHostedCSS`。

只读复现实验结果：

```json
{
  "includesNative": false,
  "includesNormalized": true,
  "nativeRewriteChanged": false,
  "normalizedRewriteChanged": true
}
```

清缓存不是根治：重新缓存仍会写正斜杠，传入替换函数的路径仍为反斜杠。建议后续独立维护 vinext 兼容补丁或验证上游修复版本，让匹配与缓存写入使用同一标准化路径；本轮没有实施。

## HTTP 验证

开发服务 `http://127.0.0.1:3001/` 的 SSR 内容中发现 11 个唯一磁盘字体地址：Geist 5 个，Geist Mono 6 个。用户看到的 10 条错误是该次浏览器实际尝试加载的数量，不应将其解释为只有 10 个声明。

正确的开发服务地址示例：

`/assets/_vinext_fonts/geist-8ac0455e797f/geist-ff2310f5.woff2`

实测返回 200、`font/woff2`。说明字体缓存和服务器资源中间件正常，错误在 CSS URL 重写阶段。

生产检查使用当前 `.next/standalone/server.js`，临时独立端口 3017（未改动 3001）。请求 `/` 及其 CSS/font 资源，不请求预览工作区或记录 2601。检查后关闭该临时进程。

| 构建中的字体文件 | HTTP | 字节 |
| --- | --- | ---: |
| 4fa387ec64143e14-s.0wkzw~je483f-.woff2 | 200 | 12872 |
| 53b9e256198e5412-s.0-wfv7uh4i7h9.woff2 | 200 | 7968 |
| 5ce348bf30bf5439-s.0zgw-jeven.3w.woff2 | 200 | 6204 |
| 6306c77e7c8268e4-s.0rhz0arwfsn~5.woff2 | 200 | 5892 |
| 7178b3e590c64307-s.0nx0ww8fni_q3.woff2 | 200 | 16540 |
| 797e433ab948586e-s.p.08e28id.o-okb.woff2 | 200 | 23108 |
| 7d817b4c03b0c5f1-s.0l76wvqk9d84w.woff2 | 200 | 7728 |
| 8a480f0b521d4e75-s.0jzbimsg8vl84.woff2 | 200 | 14900 |
| bbc41e54d2fcbd21-s.0k4k9394f2q-k.woff2 | 200 | 14712 |
| caa3a2e1cccd8315-s.p.09~u27dqhyhd6.woff2 | 200 | 29288 |
| fef07dbb0973bf53-s.12tyk43_3sh9u.woff2 | 200 | 7252 |

上述字体来自 `/_next/static/chunks/0vp.485jfjiz6.css` 的 `../media/` 引用，解析为 `/_next/static/media/`。该 CSS 中 `file:`、`.vinext`、Windows 用户目录引用数为 0。

注意：这里确认的是正式 Next.js 构建。`npm run build:legacy` 仍使用 vinext，不能由 Next 的验证推断 vinext 产物也已修复；其同一重写函数存在相同 Windows 风险。
