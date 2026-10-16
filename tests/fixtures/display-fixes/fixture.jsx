import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../app/globals.css";
import admin from "../../../app/preview-workspace/admin.module.css";
import "../../../app/preview-workspace/preview-theme.css";
import CollectionLivePreview from "../../../app/preview-workspace/collection-live-preview";
import Prism from "../../../app/templates/prism-liquid/template";
import PolaroidField from "../../../app/templates/polaroid-field/template";
import { LibraryContinuityProbe, PackageAdminContinuityProbe } from "./continuity-probes";
import { PreviewPortfolioExperience } from "../../../app/preview-workspace/portfolio-view";
import Lightbox from "../../../app/templates/shared/lightbox";
import { useTemplateInteractions } from "../../../app/templates/shared/use-template-interactions";
import "./fixture.css";
import "./night-directions.css";

const params = new URLSearchParams(location.search);
// Art-direction proofs only. Never imported by a product route or persisted.
const direction = ["silver", "dusk", "ice"].includes(params.get("direction")) ? params.get("direction") : null;
if (direction) {
  document.documentElement.dataset.nightStudy = direction;
  window.addEventListener("preview:theme-change", () => {
    document.documentElement.dataset.previewTheme = "night";
    document.documentElement.dataset.starTheme = "night";
  }, { once: true });
}
const subject = params.get("subject") ?? "prism";
const combination = params.get("photos") ?? "empty";
const embedded = params.get("host") !== "standalone";
const slots = { empty: [], few: [0, 1], mixed: [0, 2, 5, 8], full: [0, 1, 2, 3, 4, 5, 6, 7, 8] }[combination] ?? [];
const works = slots.map(index => {
  const portrait = [1, 4, 7].includes(index), width = portrait ? 400 : 600, height = portrait ? 600 : 400;
  const image = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="hsl(${index * 39 + 150} 35% 38%)"/><circle cx="50%" cy="42%" r="85" fill="white" opacity=".18"/><text x="50%" y="58%" text-anchor="middle" fill="white" font-size="45">${index + 1}</text></svg>`)}`;
  return { code: `FIX-${index}`, title: `匿名作品 ${index + 1}`, subtitle: `匿名几何照片 ${index + 1}`, image, preview: image, previewWidth: width, previewHeight: height, fullWidth: width, position: "50% 50%", slotIndex: index, enabled: true };
});
const content = { activeTemplate: "prism-liquid", profile: { mark: "F", brand: "测试画廊", photographer: "林间", role: "摄影师", city: "上海", availability: "开放预约", intro: "把角色从屏幕里带入现实，记录光线、情绪与故事。" }, hero: { eyebrow: "COSPLAY PHOTOGRAPHY", title: params.get("title") ?? "光影之间的故事", services: "漫展场照 · 外景拍摄 · 影棚创作" }, works, templateWorks: {}, packages: [], social: [], contact: { wechat: "fixture", email: "", note: "匿名测试" }, trustItems: [], bookingFields: [], statement: { eyebrow: "", lineOne: "", lineTwo: "" } };
const assets = works.map(work => ({ id: work.code, originalName: `${work.code}.svg`, width: work.previewWidth, height: work.previewHeight, aspectRatio: work.previewWidth / work.previewHeight, orientation: work.previewWidth > work.previewHeight ? "landscape" : "portrait", variants: Object.fromEntries(["full", "card", "thumbnail"].map(kind => [kind, { src: work.image, width: work.previewWidth, height: work.previewHeight }])) }));
const collection = { id: "10000000-0000-4000-8000-000000000001", name: "匿名作品集", description: "只读布局验收", visible: true, assetIds: assets.map(asset => asset.id), coverAssetId: assets[0]?.id ?? null, focusAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50 };
const portfolioDocument = { schemaVersion: 1, ...Object.fromEntries(["profile", "hero", "trustItems", "packages", "contact", "social", "bookingFields", "statement"].map(key => [key, content[key]])), collections: [collection] };
// Explicit anonymous content for full-page package/theme review; never fetched from a Site.
if (params.get("demo") === "packages") {
  portfolioDocument.packages = [
    { number: "01", english: "CONVENTION", duration: "15min", name: "漫展场照", price: "¥60", description: "快速判断现场光线与动线，在有限时间内完成角色高光。", deliverables: ["底片 80–120 张", "精修 6 张", "7 天内交付"], enabled: true },
    { number: "02", english: "PRIVATE", duration: "2 HOURS", name: "外景拍摄", price: "¥299起", description: "从参考、分镜到情绪走向，让一组照片拥有完整叙事。", deliverables: ["底片 150–250 张", "精修 12 张", "10 天内交付"], enabled: true },
    { number: "03", english: "STUDIO", duration: "3 HOURS", name: "影棚创作", price: "¥299起", description: "灯光、置景与色彩统一，把角色设定落成可触摸的世界。", deliverables: ["底片 100–150 张", "精修 9 张", "14 天内交付"], enabled: true },
  ];
  portfolioDocument.trustItems = [{ label: "BASE", value: "上海 / 苏州 / 杭州" }, { label: "PRICE", value: "¥299 起" }, { label: "DELIVERY", value: "7–14 天" }];
  portfolioDocument.contact = { wechat: "review_wechat", email: "", note: "匿名预览资料，请勿用于联系。" };
  portfolioDocument.social = [{ label: "QQ", handle: "00001234" }, { label: "抖音", handle: "https://example.com/douyin" }, { label: "小红书", handle: "https://example.com/xiaohongshu" }];
  portfolioDocument.bookingFields = ["角色 / 作品：", "日期 / 漫展：", "城市 / 场地：", "单人 / 多人：", "选择套餐：", "想要的视觉风格：", "参考图链接：", "预算范围：", "联系方式："];
}

const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
function rgba(value) { const values = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [...values.slice(0, 3), values[3] ?? 1]; }
function over(top, bottom) { const a = top[3]; return [0, 1, 2].map(index => top[index] * a + bottom[index] * (1 - a)).concat(1); }
function luminance(color) { return color.slice(0, 3).map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0); }
function buttonMeasure(button) {
  const ancestors = []; let element = button;
  while (element) { ancestors.unshift(element); element = element.parentElement; }
  let background = [255, 255, 255, 1];
  const imageLayers = [];
  for (const ancestor of ancestors) { const css = getComputedStyle(ancestor); background = over(rgba(css.backgroundColor), background); if (css.backgroundImage !== "none") imageLayers.push(css.backgroundImage); }
  const css = getComputedStyle(button), foreground = over(rgba(css.color), background);
  const a = luminance(foreground), b = luminance(background);
  return { text: button.textContent, label: button.getAttribute("aria-label"), pressed: button.getAttribute("aria-pressed"), focused: button === document.activeElement, color: css.color, background: css.backgroundColor, effectiveSolidBackground: background, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), imageLayers, outline: css.outline, ...rect(button) };
}
function measure() {
  if (["library", "package-admin", "field"].includes(subject)) return { subject, pass: null, note: "Interaction probe: verify actions and focus in the browser." };
  if (subject === "portfolio") {
    const preview = document.querySelector("[data-site-premium]");
    const buttons = [...preview.querySelectorAll("button, a")].filter(button => button.offsetWidth && button.offsetHeight).map(buttonMeasure);
    return { subject, embedded, theme: document.documentElement.dataset.starTheme, pass: null, buttons, contrastLimit: "Portfolio contains image and gradient backgrounds: compare listed actual colors with screenshots; no blanket contrast pass is asserted." };
  }
  if (subject !== "prism") {
    const preview = document.querySelector('[aria-label="当前图集即时效果"]');
    const buttons = [...preview.querySelectorAll("button")].filter(button => button.offsetWidth && button.offsetHeight).map(buttonMeasure);
    const controls = buttons.filter(button => ["切换到纸面", "切换到夜空", "桌面", "手机", "星座", "散落", "跨页"].includes(button.text));
    return { subject, embedded, theme: preview.dataset.starTheme, pass: controls.every(button => button.contrast >= 4.5), controls, buttons, contrastLimit: "Solid-color alpha compositing; gradient/image layers are listed and require visual verification." };
  }
  const hero = document.querySelector("#prism-top"), rail = document.querySelector('[aria-label="选择主视觉作品"]');
  const title = hero.querySelector("h1"), intro = hero.querySelector("p"), heroCopy = title.parentElement, stage = rail.previousElementSibling;
  const width = document.documentElement.clientWidth;
  const bounds = [heroCopy, title, intro, stage, rail, ...rail.children].map(element => ({ tag: element.tagName, ...rect(element), minWidth: getComputedStyle(element).minWidth }));
  const textBounds = [title, intro].flatMap(element => { const range = document.createRange(); range.selectNodeContents(element); return [...range.getClientRects()].filter(r => r.width > 0).map(r => ({ x: r.x, right: r.right, y: r.y, height: r.height })); });
  const headingRange = document.createRange(); headingRange.selectNodeContents(title);
  const headingBounds = [...headingRange.getClientRects()].map(r => ({ x: r.x, right: r.right, y: r.y, height: r.height }));
  const images = [...hero.querySelectorAll("img")].map(image => ({ complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, objectFit: getComputedStyle(image).objectFit, ...rect(image) }));
  const pass = rail.children.length === 9 && [...bounds, ...textBounds].every(r => r.x >= -.5 && r.right <= width + .5) && images.every(image => image.complete && image.naturalWidth > 0);
  const heroCss = getComputedStyle(hero);
  return { subject, combination, pass, viewport: { width: innerWidth, height: innerHeight, clientWidth: width }, hero: rect(hero), heroCopy: rect(heroCopy), heroPadding: { top: heroCss.paddingTop, right: heroCss.paddingRight, bottom: heroCss.paddingBottom, left: heroCss.paddingLeft }, headingBounds, gridColumns: heroCss.gridTemplateColumns, railGap: getComputedStyle(rail).gap, slots: rail.children.length, buttons: rail.querySelectorAll("button").length, bounds, textBounds, images };
}
function keepCurrentView(event) {
  const target = new URL(event.currentTarget.href);
  target.hash = location.hash;
  event.currentTarget.href = target.href;
}
function Fixture() {
  const [result, setResult] = useState(null), [previewOpen, setPreviewOpen] = useState(true);
  const interactions = useTemplateInteractions(works);
  const closeLightbox = () => interactions.setActiveWork(null);
  useEffect(() => { window.measureDisplayFixes = measure; return () => { delete window.measureDisplayFixes; }; }, []);
  return <>
    {subject === "library" ? <LibraryContinuityProbe assets={assets} /> : subject === "package-admin" ? <PackageAdminContinuityProbe portfolioDocument={portfolioDocument} assets={assets} /> : subject === "field" ? <PolaroidField templateId="polaroid-field" content={content} works={works} packages={[]} bookingTemplate="测试" copiedKey={interactions.copiedKey} booted onCopy={interactions.copyText} onOpenWork={interactions.openWork} /> : subject === "prism" ? <Prism templateId="prism-liquid" content={content} works={works} packages={[]} bookingTemplate="测试" copiedKey={interactions.copiedKey} booted isPreview onCopy={interactions.copyText} onOpenWork={interactions.openWork} /> : subject === "portfolio" ? previewOpen ? <section className={embedded ? admin.preview : undefined} role={embedded ? "dialog" : undefined} aria-modal={embedded ? "true" : undefined} aria-label={embedded ? "新版未保存草稿效果" : undefined}>
      {embedded && <div className={admin.previewBar}><p>当前编辑快照 · 预览不会保存或发布</p><button type="button" onClick={() => setPreviewOpen(false)}>关闭草稿效果</button></div>}
      <div data-site-premium><PreviewPortfolioExperience document={portfolioDocument} assets={assets} embedded={embedded} initialCollectionId={params.get("collection") === "open" ? collection.id : undefined} /></div>
    </section> : <button type="button" onClick={() => setPreviewOpen(true)}>重新打开草稿效果</button> : <div className={embedded ? admin.workspace : undefined} data-site-editor={embedded ? "premium" : undefined}>
      <div className="fixture-admin" aria-label="后台控件对照"><button type="button" className={admin.primary}>保存并发布</button><button type="button" disabled>仅保存草稿</button><button type="button">关闭预览</button><input aria-label="筛选对照" placeholder="筛选照片" /></div>
      <div className={embedded ? admin.panel : undefined}><CollectionLivePreview collection={collection} assets={assets} onView={asset => interactions.openWork(works.find(work => work.code === asset.id))} /></div>
    </div>}
    {interactions.activeWork && <Lightbox theme="light" appearance="light" basicTemplate={subject === "prism" ? "prism-liquid" : undefined} work={interactions.activeWork} works={[...interactions.lightboxWorks]} frameRef={interactions.lightboxRef} closeButtonRef={interactions.closeButtonRef} onMove={interactions.moveActiveWork} onClose={closeLightbox} />}
    <details className="fixture-report"><summary>{direction ? ({ silver: 'A · 银盐暗房', dusk: 'B · 暮紫夜空', ice: '原冰蓝对照' })[direction] + ' · 切换方案' : '隔离验收工具'}</summary>{direction && <nav aria-label="设计方案对照">{[['silver','A 银盐暗房'],['dusk','B 暮紫夜空'],['ice','原冰蓝']].map(([value,label]) => <p key={value}><a onClick={keepCurrentView} onFocus={keepCurrentView} onPointerEnter={keepCurrentView} href={`?subject=portfolio&photos=${combination}&host=standalone&demo=packages&direction=${value}${location.hash}`}>{label}</a></p>)}<p>匿名样稿 · 不保存或发布</p></nav>}<p>当前：{subject} / {combination} / {embedded ? "后台内嵌" : "独立组件"}</p><nav>{["empty", "few", "mixed", "full"].map(value => <a key={value} onClick={keepCurrentView} href={`?subject=${subject}&photos=${value}&host=${embedded ? "embedded" : "standalone"}&demo=${params.get("demo") ?? ""}${direction ? `&direction=${direction}` : ""}${location.hash}`}>{value} </a>)}</nav><p><a href="?subject=prism&photos=empty">Prism</a> · <a href="?subject=polaroid&photos=mixed&host=embedded">拍立得内嵌</a> · <a href="?subject=polaroid&photos=mixed&host=standalone">拍立得独立</a></p><button type="button" onClick={() => setResult(measure())}>测量当前实际布局与颜色</button>{result && <><strong>{result.pass ? "PASS" : "FAIL"}</strong><pre>{JSON.stringify(result, null, 2)}</pre></>}</details>
  </>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
