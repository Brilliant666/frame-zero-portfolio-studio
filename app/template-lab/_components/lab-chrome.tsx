import type { CSSProperties } from "react";
import { createInlineCssModule } from "../_lib/inline-css-module";
import type { LabPrototype } from "../_lib/prototype-catalog";
import { LAB_STATUS_LABELS } from "../_lib/prototype-catalog";
import labChromeCss from "./lab-chrome.module.css?inline";

const styles = createInlineCssModule(labChromeCss);

export function LabStatus() {
  return (
    <div className={styles.status} aria-label="Template Lab experiment status">
      {LAB_STATUS_LABELS.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

export function LabBackLink() {
  return (
    <a className={styles.backLink} href="/template-lab">
      <span aria-hidden="true">←</span> Template Lab index
    </a>
  );
}

export function LabPlaceholder({
  index,
  label,
  ratio,
  className,
}: Readonly<{
  index: number;
  label: string;
  ratio: string;
  className?: string;
}>) {
  const classes = [styles.placeholder, className].filter(Boolean).join(" ");
  return (
    <div
      className={classes}
      data-lab-placeholder="true"
      data-photo-ratio={ratio}
      role="img"
      aria-label={`${label}; experimental ${ratio} photography placeholder`}
      style={{ aspectRatio: ratio.replace(":", " / ") } as CSSProperties}
    >
      <span className={styles.placeholderIndex} aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className={styles.placeholderFocus} aria-hidden="true" />
      <span className={styles.placeholderLabel} aria-hidden="true">
        IMAGE PLACEHOLDER · {ratio}
      </span>
    </div>
  );
}

export function LabBrief({ prototype }: Readonly<{ prototype: LabPrototype }>) {
  const headingId = `${prototype.id}-design-brief`;
  return (
    <section className={styles.brief} aria-labelledby={headingId}>
      <div className={styles.briefIntro}>
        <p>DESIGN-00 / TEMPLATE-LAB-00</p>
        <h2 id={headingId}>Prototype design brief</h2>
        <p>
          This page is an isolated visual study. It has no production content source, stable template
          identity, persistence path, or runtime integration.
        </p>
      </div>
      <dl className={styles.briefGrid}>
        <div>
          <dt>Prototype</dt>
          <dd><code>{prototype.id}</code> · {prototype.name}</dd>
        </div>
        <div>
          <dt>Primary browsing model</dt>
          <dd>{prototype.browsingModel}</dd>
        </div>
        <div>
          <dt>Design direction</dt>
          <dd>{prototype.direction}</dd>
        </div>
        <div>
          <dt>Photo slots</dt>
          <dd>{prototype.slotRatios.length} · {prototype.slotRatios.join(" / ")}</dd>
        </div>
        <div>
          <dt>Desktop</dt>
          <dd>{prototype.desktop}</dd>
        </div>
        <div>
          <dt>Tablet</dt>
          <dd>{prototype.tablet}</dd>
        </div>
        <div>
          <dt>Mobile / 320px</dt>
          <dd>{prototype.mobile}</dd>
        </div>
        <div>
          <dt>Persistence</dt>
          <dd>Forbidden. This prototype cannot be selected, registered, stored, or migrated.</dd>
        </div>
      </dl>
      <LabStatus />
      <LabBackLink />
    </section>
  );
}
