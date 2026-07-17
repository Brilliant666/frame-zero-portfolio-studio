import { LabStatus } from "./_components/lab-chrome";
import { createInlineCssModule } from "./_lib/inline-css-module";
import { labPrototypeCatalog } from "./_lib/prototype-catalog";
import templateLabCss from "./template-lab.module.css?inline";

const styles = createInlineCssModule(templateLabCss);

export default function TemplateLabIndexPage() {
  return (
    <main id="lab-content" className={styles.index} data-template-lab="index">
      <header className={styles.indexHeader}>
        <div className={styles.indexEyebrow}>
          <span>DESIGN-00</span>
          <span>TEMPLATE-LAB-00</span>
          <span>{labPrototypeCatalog.length} RUNNABLE STUDIES</span>
        </div>
        <h1>Template Lab</h1>
        <p>
          Photography-first layout experiments kept outside the formal template catalog, content
          contracts, API, and persistence. Open a route to inspect its composition and design brief.
        </p>
        <LabStatus />
      </header>

      <ol className={styles.prototypeList} aria-label="Runnable Template Lab prototypes">
        {labPrototypeCatalog.map((prototype, index) => (
          <li key={prototype.id} className={styles.prototypeCard}>
            <div className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</div>
            <div className={styles.cardTitle}>
              <span>STAGE {prototype.stage} · {prototype.status}</span>
              <h2>{prototype.name}</h2>
              <code>{prototype.id}</code>
            </div>
            <dl>
              <div>
                <dt>Browsing model</dt>
                <dd>{prototype.browsingModel}</dd>
              </div>
              <div>
                <dt>Photo slots</dt>
                <dd>{prototype.slotRatios.length} · {prototype.slotRatios.join(" / ")}</dd>
              </div>
              <div>
                <dt>Direction</dt>
                <dd>{prototype.direction}</dd>
              </div>
              <div>
                <dt>Responsive support</dt>
                <dd>Desktop / Tablet / Mobile / 320px</dd>
              </div>
              <div>
                <dt>Persistence</dt>
                <dd>Not available</dd>
              </div>
            </dl>
            <a href={prototype.route} aria-label={`Open ${prototype.name} experimental prototype`}>
              Open prototype <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ol>

      <footer className={styles.indexFooter}>
        <p>Review surface only. No prototype is selectable by the production site.</p>
        <a href="#lab-content">Back to top ↑</a>
      </footer>
    </main>
  );
}
