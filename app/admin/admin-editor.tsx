"use client";

/* eslint-disable @next/next/no-img-element -- admin thumbnails reuse locally generated responsive assets. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cloneSiteContent,
  siteConfig,
  templateCatalog,
  type PhotographyPackage,
  type SiteContent,
  type Work,
} from "../site-config";
import PhotoLibraryEditor from "./photo-library-editor";

type SaveState = "idle" | "loading" | "saving" | "saved" | "error";

function fieldLabel(label: string, value: string, onChange: (value: string) => void, options?: { area?: boolean; placeholder?: string }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {options?.area ? (
        <textarea value={value} placeholder={options.placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} placeholder={options?.placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function formatSavedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
  }).format(date);
}

export default function AdminEditor({ editorLabel }: { editorLabel: string }) {
  const [content, setContent] = useState<SiteContent>(() => cloneSiteContent());
  const [state, setState] = useState<SaveState>("loading");
  const [message, setMessage] = useState("正在读取数据库…");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const saveResetTimerRef = useRef<number | null>(null);

  const visibleWorkCount = useMemo(() => content.works.filter((work) => work.enabled).length, [content.works]);
  const formattedUpdatedAt = useMemo(() => formatSavedAt(updatedAt), [updatedAt]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/site-content", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("读取失败");
        return response.json() as Promise<{ content: SiteContent; updatedAt: string | null; warning?: string }>;
      })
      .then((result) => {
        if (cancelled) return;
        setContent(result.content);
        setUpdatedAt(result.updatedAt);
        setState("idle");
        setMessage(result.warning ? "已使用默认数据，数据库暂不可用" : "内容已载入，可以开始修改");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "读取失败");
      });

    return () => {
      cancelled = true;
      if (saveResetTimerRef.current !== null) window.clearTimeout(saveResetTimerRef.current);
    };
  }, []);

  const save = async () => {
    if (saveResetTimerRef.current !== null) {
      window.clearTimeout(saveResetTimerRef.current);
      saveResetTimerRef.current = null;
    }
    setState("saving");
    setMessage("正在保存到数据库…");

    try {
      const response = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = await response.json() as { content?: SiteContent; updatedAt?: string | null; error?: string };
      if (!response.ok || !result.content) throw new Error(result.error ?? "保存失败");

      setContent(result.content);
      setUpdatedAt(result.updatedAt ?? null);
      setState("saved");
      setMessage("已保存，刷新主页即可看到新内容");
      saveResetTimerRef.current = window.setTimeout(() => {
        setState("idle");
        saveResetTimerRef.current = null;
      }, 2400);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  const reset = () => {
    setContent(cloneSiteContent(siteConfig));
    setState("idle");
    setMessage("已恢复为示例数据，点击保存后才会写入数据库");
  };

  const updatePackage = (index: number, patch: Partial<PhotographyPackage>) => {
    setContent((current) => ({
      ...current,
      packages: current.packages.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const updateWork = (index: number, patch: Partial<Work>) => {
    setContent((current) => ({
      ...current,
      works: current.works.map((work, workIndex) => workIndex === index ? { ...work, ...patch } : work),
    }));
  };

  const moveWork = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= content.works.length) return;
    setContent((current) => {
      const works = [...current.works];
      [works[index], works[target]] = [works[target], works[index]];
      return { ...current, works };
    });
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="admin-kicker">FRAME//ZERO · CONTENT SYSTEM</span>
          <h1>摄影主页后台</h1>
          <p>资料、套餐、交付张数、作品展示和模板，都在这里修改。</p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-mode">● {editorLabel}</span>
          <a href={`/?template=${content.activeTemplate}`} target="_blank" rel="noreferrer">预览当前模板 ↗</a>
          <button type="button" className="admin-save" onClick={save} disabled={state === "saving" || state === "loading"}>
            {state === "saving" ? "保存中…" : "保存全部修改"}
          </button>
        </div>
      </header>

      <div className={`admin-status is-${state}`} role="status">
        <span>{message}</span>
        <small>{formattedUpdatedAt ? `上次保存：${formattedUpdatedAt}` : "当前为初始示例数据"}</small>
      </div>

      <nav className="admin-nav" aria-label="后台分区">
        <a href="#template">页面模板</a>
        <a href="#profile">个人资料</a>
        <a href="#packages">套餐价格</a>
        <a href="#library">素材库与排版</a>
        <a href="#contact">联系与约拍</a>
      </nav>

      <fieldset className="admin-layout" disabled={state === "saving" || state === "loading"}>
        <section id="template" className="admin-panel admin-panel-wide">
          <div className="admin-panel-title">
            <div><small>01</small><h2>页面模板</h2></div>
            <p>每套都是独立布局与交互；资料、作品和套餐保持一致。</p>
          </div>
          <div className="template-picker">
            {templateCatalog.map((template, index) => (
              <div key={template.id} className={`template-option-wrap is-${template.id}`}>
                <label className="template-option">
                  <input
                    type="radio"
                    name="active-template"
                    checked={content.activeTemplate === template.id}
                    onChange={() => setContent((current) => ({ ...current, activeTemplate: template.id }))}
                  />
                  <span className="template-swatch"><i /><b /></span>
                  <span className="template-state">READY · {String(index + 1).padStart(2, "0")}</span>
                  <strong>{template.name}</strong>
                  <small>{template.description}</small>
                  <span className="template-photo-plan">
                    {template.photoSlots} 个固定照片位
                    <small>{template.photoRatios}</small>
                  </span>
                </label>
                <a className="template-card-preview" href={`/?template=${template.id}`} target="_blank" rel="noreferrer">独立预览 ↗</a>
              </div>
            ))}
          </div>
        </section>

        <section id="profile" className="admin-panel">
          <div className="admin-panel-title">
            <div><small>02</small><h2>摄影师资料</h2></div>
            <p>所有虚拟信息都可以在这里替换。</p>
          </div>
          <div className="admin-form-grid">
            {fieldLabel("品牌名", content.profile.brand, (value) => setContent((current) => ({ ...current, profile: { ...current.profile, brand: value } })))}
            {fieldLabel("品牌缩写", content.profile.mark, (value) => setContent((current) => ({ ...current, profile: { ...current.profile, mark: value } })))}
            {fieldLabel("摄影师名称", content.profile.photographer, (value) => setContent((current) => ({ ...current, profile: { ...current.profile, photographer: value } })))}
            {fieldLabel("身份描述", content.profile.role, (value) => setContent((current) => ({ ...current, profile: { ...current.profile, role: value } })))}
            {fieldLabel("可约城市", content.profile.city, (value) => setContent((current) => ({ ...current, profile: { ...current.profile, city: value } })))}
            {fieldLabel("档期状态", content.profile.availability, (value) => setContent((current) => ({ ...current, profile: { ...current.profile, availability: value } })))}
            {fieldLabel("个人简介", content.profile.intro, (value) => setContent((current) => ({ ...current, profile: { ...current.profile, intro: value } })), { area: true })}
            {fieldLabel("首页英文眉题", content.hero.eyebrow, (value) => setContent((current) => ({ ...current, hero: { ...current.hero, eyebrow: value } })))}
            {fieldLabel("首页主标题", content.hero.title, (value) => setContent((current) => ({ ...current, hero: { ...current.hero, title: value } })))}
            {fieldLabel("服务摘要", content.hero.services, (value) => setContent((current) => ({ ...current, hero: { ...current.hero, services: value } })))}
          </div>

          <h3 className="admin-subtitle">首页关键信息</h3>
          <div className="admin-repeat-grid">
            {content.trustItems.map((item, index) => (
              <div className="admin-pair" key={`${item.label}-${index}`}>
                <input aria-label={`信息 ${index + 1} 标签`} value={item.label} onChange={(event) => setContent((current) => ({ ...current, trustItems: current.trustItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry) }))} />
                <input aria-label={`信息 ${index + 1} 内容`} value={item.value} onChange={(event) => setContent((current) => ({ ...current, trustItems: current.trustItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, value: event.target.value } : entry) }))} />
              </div>
            ))}
          </div>
        </section>

        <section id="packages" className="admin-panel">
          <div className="admin-panel-title">
            <div><small>03</small><h2>套餐与交付</h2></div>
            <p>底片、精修数量和交付时间，每行填写一项。</p>
          </div>
          <div className="admin-stack">
            {content.packages.map((item, index) => (
              <article className="package-editor" key={`${item.number}-${index}`}>
                <div className="editor-card-head">
                  <strong>{item.number} · {item.name}</strong>
                  <label className="admin-toggle"><input type="checkbox" checked={item.enabled} onChange={(event) => updatePackage(index, { enabled: event.target.checked })} /><span />主页显示</label>
                </div>
                <div className="admin-form-grid admin-form-compact">
                  {fieldLabel("中文名称", item.name, (value) => updatePackage(index, { name: value }))}
                  {fieldLabel("英文名称", item.english, (value) => updatePackage(index, { english: value }))}
                  {fieldLabel("价格", item.price, (value) => updatePackage(index, { price: value }))}
                  {fieldLabel("拍摄时长", item.duration, (value) => updatePackage(index, { duration: value }))}
                  {fieldLabel("套餐说明", item.description, (value) => updatePackage(index, { description: value }), { area: true })}
                  {fieldLabel("交付内容（每行一项）", item.deliverables.join("\n"), (value) => updatePackage(index, { deliverables: value.split("\n").filter(Boolean) }), { area: true })}
                </div>
              </article>
            ))}
          </div>
        </section>

        <PhotoLibraryEditor content={content} setContent={setContent} />

        <section id="works" className="admin-panel admin-panel-wide admin-legacy-panel">
          <div className="admin-panel-title">
            <div><small>LEGACY</small><h2>旧版兼容作品</h2></div>
            <p>仅当某个模板尚未使用新素材库排版时生效；当前保留 {visibleWorkCount} / {content.works.length} 组。</p>
          </div>
          <div className="work-editor-grid">
            {content.works.map((work, index) => (
              <article className={`work-editor ${work.enabled ? "" : "is-disabled"}`} key={`${work.image}-${index}`}>
                <img
                  src={work.preview}
                  width={work.previewWidth}
                  height={work.previewHeight}
                  loading="lazy"
                  decoding="async"
                  alt=""
                />
                <div className="work-editor-body">
                  <div className="editor-card-head">
                    <strong>{String(index + 1).padStart(2, "0")} · {work.code}</strong>
                    <label className="admin-toggle"><input type="checkbox" checked={work.enabled} onChange={(event) => updateWork(index, { enabled: event.target.checked })} /><span />显示</label>
                  </div>
                  {fieldLabel("作品标题", work.title, (value) => updateWork(index, { title: value }))}
                  {fieldLabel("作品描述", work.subtitle, (value) => updateWork(index, { subtitle: value }))}
                  {fieldLabel("画面焦点（CSS object-position）", work.position, (value) => updateWork(index, { position: value }), { placeholder: "50% 50%" })}
                  <div className="work-order">
                    <button type="button" onClick={() => moveWork(index, -1)} disabled={index === 0}>↑ 前移</button>
                    <button type="button" onClick={() => moveWork(index, 1)} disabled={index === content.works.length - 1}>↓ 后移</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="admin-hint">这里保留旧数据，避免升级后主页空白。为模板执行一次“智能排版”或手动选片后，该模板会改用上方的新槽位数据。</p>
        </section>

        <section id="contact" className="admin-panel admin-panel-wide">
          <div className="admin-panel-title">
            <div><small>05</small><h2>联系与约拍</h2></div>
            <p>替换示例联系方式，并自定义客户复制的约拍清单。</p>
          </div>
          <div className="admin-form-grid">
            {fieldLabel("微信号", content.contact.wechat, (value) => setContent((current) => ({ ...current, contact: { ...current.contact, wechat: value } })))}
            {fieldLabel("邮箱", content.contact.email, (value) => setContent((current) => ({ ...current, contact: { ...current.contact, email: value } })))}
            {fieldLabel("联系区说明", content.contact.note, (value) => setContent((current) => ({ ...current, contact: { ...current.contact, note: value } })), { area: true })}
            {fieldLabel("约拍清单（每行一项）", content.bookingFields.join("\n"), (value) => setContent((current) => ({ ...current, bookingFields: value.split("\n").filter(Boolean) })), { area: true })}
          </div>

          <h3 className="admin-subtitle">平台账号</h3>
          <div className="admin-repeat-grid">
            {content.social.map((item, index) => (
              <div className="admin-pair" key={`${item.label}-${index}`}>
                <input aria-label={`平台 ${index + 1}`} value={item.label} onChange={(event) => setContent((current) => ({ ...current, social: current.social.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry) }))} />
                <input aria-label={`账号 ${index + 1}`} value={item.handle} onChange={(event) => setContent((current) => ({ ...current, social: current.social.map((entry, itemIndex) => itemIndex === index ? { ...entry, handle: event.target.value } : entry) }))} />
              </div>
            ))}
          </div>

          <h3 className="admin-subtitle">底部宣言</h3>
          <div className="admin-form-grid">
            {fieldLabel("英文眉题", content.statement.eyebrow, (value) => setContent((current) => ({ ...current, statement: { ...current.statement, eyebrow: value } })))}
            {fieldLabel("中文第一行", content.statement.lineOne, (value) => setContent((current) => ({ ...current, statement: { ...current.statement, lineOne: value } })))}
            {fieldLabel("中文第二行", content.statement.lineTwo, (value) => setContent((current) => ({ ...current, statement: { ...current.statement, lineTwo: value } })))}
          </div>
        </section>
      </fieldset>

      <footer className="admin-footer">
        <div><strong>修改完成后别忘了保存</strong><span>主页会在刷新时读取最新数据。</span></div>
        <button type="button" className="admin-reset" onClick={reset}>恢复示例数据</button>
        <button type="button" className="admin-save" onClick={save} disabled={state === "saving" || state === "loading"}>保存全部修改</button>
      </footer>
    </main>
  );
}
