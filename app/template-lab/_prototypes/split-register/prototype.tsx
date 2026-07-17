import {
  LabBackLink,
  LabBrief,
  LabPlaceholder,
  LabStatus,
} from "../../_components/lab-chrome";
import { labDemoSeries } from "../../_lib/demo-content";
import { createInlineCssModule } from "../../_lib/inline-css-module";
import { getLabPrototype } from "../../_lib/prototype-catalog";
import prototypeCss from "./prototype.module.css?inline";

const prototype = getLabPrototype("split-register");
const registerEntries = labDemoSeries.slice(0, 8);
const styles = createInlineCssModule(prototypeCss);

export default function SplitRegisterPrototype() {
  return (
    <>
      <style data-template-lab-style={prototype.id}>{prototypeCss}</style>
      <main
        id="lab-content"
        className={styles.root}
        data-lab-prototype="split-register"
        data-browsing-model={prototype.browsingModel}
      >
      <header className={styles.masthead}>
        <div className={styles.mastheadTopline}>
          <LabBackLink />
          <p>STAGE A · STUDY 02 · 08 ENTRIES</p>
        </div>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>NUMBERED DIRECTORY / IMAGE LEDGER / ANNOTATION TRACK</p>
          <h1>Split Register</h1>
          <p className={styles.dek}>
            Eight photographs are kept in one auditable reading order. The directory locates each
            entry; the ruled ledger gives its image and annotation equal, separate space.
          </p>
        </div>
        <LabStatus />
      </header>

      <section className={styles.register} aria-labelledby="split-register-heading">
        <div className={styles.sectionHeading}>
          <p>REGISTER / 001—008</p>
          <h2 id="split-register-heading">A directory that reads beside the photographs.</h2>
          <p>
            Choose a numbered anchor or follow the ledger in document order. No filtering,
            selection state, file controls, or inspector is implied.
          </p>
        </div>

        <div className={styles.registerLayout}>
          <nav className={styles.directory} aria-label="Split Register entry directory">
            <p className={styles.directoryLabel}>Jump index</p>
            <ol>
              {registerEntries.map((entry) => {
                const anchor = `split-register-entry-${entry.number}`;
                return (
                  <li key={entry.number}>
                    <a
                      href={`#${anchor}`}
                      aria-label={`Jump to register entry ${entry.number}: ${entry.title}`}
                    >
                      <span className={styles.directoryNumber}>{entry.number}</span>
                      <span className={styles.directoryText}>
                        <strong>{entry.chapter}</strong>
                        <small>{entry.title}</small>
                      </span>
                      <span className={styles.directoryArrow} aria-hidden="true">↓</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          <ol className={styles.ledger} aria-label="Eight experimental photography ledger entries">
            {registerEntries.map((entry, index) => {
              const anchor = `split-register-entry-${entry.number}`;
              const headingId = `${anchor}-heading`;
              const ratio = prototype.slotRatios[index] ?? "3:2";

              return (
                <li key={entry.number}>
                  <article
                    id={anchor}
                    className={styles.entry}
                    aria-labelledby={headingId}
                    tabIndex={0}
                  >
                    <div className={styles.entryNumber} aria-hidden="true">
                      <span>{entry.number}</span>
                      <small>/ 08</small>
                    </div>

                    <figure className={styles.imageLedger}>
                      <LabPlaceholder
                        className={styles.photoPlaceholder}
                        index={index}
                        label={`${entry.chapter}: ${entry.title}`}
                        ratio={ratio}
                      />
                      <figcaption>
                        <span>{entry.chapter}</span>
                        <span>{entry.subtitle}</span>
                      </figcaption>
                    </figure>

                    <div className={styles.annotation}>
                      <p className={styles.annotationLabel}>ANNOTATION / {entry.number}</p>
                      <h3 id={headingId}>{entry.title}</h3>
                      <p>{entry.note}</p>
                      <dl>
                        <div>
                          <dt>Frame</dt>
                          <dd>{ratio}</dd>
                        </div>
                        <div>
                          <dt>Order</dt>
                          <dd>{String(index + 1).padStart(2, "0")} of 08</dd>
                        </div>
                      </dl>
                      <a href="#split-register-heading">Return to register <span aria-hidden="true">↑</span></a>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

        <LabBrief prototype={prototype} />
      </main>
    </>
  );
}
