"use client";
import { createEmptyBasicContent } from "../site-editor/content-schema";
import { templateCatalog, type TemplateId } from "../templates/catalog";
import TemplateRenderer from "../templates/template-renderer";

export default function TemplateLaboratory({ templateId }: { templateId: TemplateId }) {
  const content = createEmptyBasicContent();
  content.activeTemplate = templateId;
  content.profile = { brand: "模板实验室", mark: "LAB", photographer: "示例摄影师", role: "空白模板对照", city: "", availability: "", intro: "本站仅展示模板结构，不包含任何摄影师的私人作品。" };
  content.hero = { eyebrow: "TEMPLATE LAB", title: "摄影作品模板", services: "非私人示例 · 无真实素材" };
  return <>
    <aside aria-label="模板实验室" style={{ position: "fixed", zIndex: 10000, bottom: 12, right: 12, width: "min(360px, calc(100vw - 24px))", padding: 12, boxSizing: "border-box", background: "#fff", color: "#18232a", border: "1px solid #b6bec5", borderRadius: 8 }}>
      <strong>模板实验室 · 11 套模板</strong>
      <p style={{ margin: "4px 0 8px", fontSize: 12 }}>这是安全模板对照页，不是摄影师 Site；仅使用非私人示例和空作品库。</p>
      <form action="/test" method="get" style={{ display: "flex", gap: 8 }}>
        <label htmlFor="laboratory-template" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>选择模板</label>
        <select key={templateId} id="laboratory-template" name="template" defaultValue={templateId} style={{ minWidth: 0, flex: 1, padding: 8 }}>
          {templateCatalog.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
        <button type="submit" style={{ padding: "8px 12px" }}>查看</button>
      </form>
      <a href="/test/admin" style={{ display: "inline-block", marginTop: 8, fontSize: 12 }}>进入本人基础后台</a>
    </aside>
    <TemplateRenderer key={templateId} templateId={templateId} content={content} works={[]} packages={[]} bookingTemplate="" booted copiedKey={null} isPreview onCopy={async () => {}} onOpenWork={() => {}} />
  </>;
}
