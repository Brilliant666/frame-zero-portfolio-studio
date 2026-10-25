"use client";

import { useRef, useState } from "react";
import showcase from "./platform-showcase.module.css";

type LayoutPreview = Readonly<{ id: string; name: string; src: string }>;

export default function PlatformTemplateShowcase({ previews }: { previews: readonly LayoutPreview[] }) {
  const [selected, setSelected] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const active = previews[selected];

  function select(index: number) {
    setSelected(index);
    // Scroll only the thumbnail strip; browsing diagrams must not move the page.
    const rail = strip.current;
    const button = rail?.querySelectorAll<HTMLButtonElement>("button")[index];
    if (!rail || !button) return;
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    if (left < rail.scrollLeft || right > rail.scrollLeft + rail.clientWidth) {
      rail.scrollTo({ left: left - (rail.clientWidth - button.offsetWidth) / 2 });
    }
  }

  return (
    <article className={showcase.space} aria-label="基础版布局展示">
      <div className={showcase.spaceVisual} id="basic-layout-preview">
        {/* Public repository diagrams, never Site assets. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={active.src} width={1200} height={675} loading="lazy" alt={`基础版${active.name}的页面布局示意`} />
      </div>
      <div className={showcase.spaceTitle}><span>01 / BASIC</span><h3>基础版</h3><span>{previews.length} 种风格</span></div>
      <p>从电影光幕到漫画分镜，以不同版式呈现照片、服务与联系信息。</p>
      <div className={showcase.layoutControls}>
        <p aria-live="polite" aria-atomic="true"><span>{String(selected + 1).padStart(2, "0")} / {previews.length}</span><strong>{active.name}</strong></p>
        <div>
          <button type="button" aria-label="上一套基础版布局" aria-controls="basic-layout-preview" disabled={selected === 0} onClick={() => select(selected - 1)}>←</button>
          <button type="button" aria-label="下一套基础版布局" aria-controls="basic-layout-preview" disabled={selected === previews.length - 1} onClick={() => select(selected + 1)}>→</button>
        </div>
      </div>
      <div ref={strip} className={showcase.layoutStrip} role="group" aria-label="选择基础版布局示意">
        {previews.map((preview, index) => (
          <button type="button" key={preview.id} aria-label={`查看${preview.name}布局示意`} aria-pressed={selected === index} aria-controls="basic-layout-preview" onClick={() => select(index)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.src} width={1200} height={675} loading="lazy" alt="" />
            <span>{preview.name}</span>
          </button>
        ))}
      </div>
    </article>
  );
}
