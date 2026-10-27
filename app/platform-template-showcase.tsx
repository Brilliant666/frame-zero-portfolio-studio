import showcase from "./platform-showcase.module.css";

type LayoutPreview = Readonly<{ id: string; name: string; src: string }>;

export default function PlatformTemplateShowcase({ previews }: { previews: readonly LayoutPreview[] }) {
  return (
    <ol className={showcase.basicLayouts} aria-label="基础版九宫格布局示意">
        {previews.map((preview, index) => (
          <li key={preview.id} data-template-layout={preview.id}>
            <figure>
              <div className={`${showcase.spaceVisual} ${showcase.basicVisual}`}>
                {/* Public repository diagrams, never Site assets. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.src} width={1200} height={675} loading="lazy" alt={`${preview.name}的页面布局示意`} />
              </div>
              <figcaption><span>{String(index + 1).padStart(2, "0")}</span><h4>{preview.name}</h4></figcaption>
            </figure>
          </li>
        ))}
    </ol>
  );
}
