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

const prototype = getLabPrototype("quiet-focus");
const frames = labDemoSeries.slice(0, prototype.slotRatios.length);
const styles = createInlineCssModule(prototypeCss);

export function QuietFocusPrototype() {
  return (
    <>
      <style data-template-lab-style={prototype.id}>{prototypeCss}</style>
      <main
        id="lab-content"
        className={styles.prototype}
        data-lab-prototype="quiet-focus"
        data-browsing-model={prototype.browsingModel}
      >
      <header className={styles.intro}>
        <div className={styles.introTopline}>
          <LabBackLink />
          <p>STAGE {prototype.stage} · {prototype.status}</p>
        </div>
        <div className={styles.introBody}>
          <p className={styles.eyebrow}>FRAME//ZERO · ISOLATED PHOTOGRAPHY STUDY</p>
          <h1>{prototype.name}</h1>
          <p className={styles.dek}>
            Five uninterrupted frames give each photograph a full viewport of attention. Captions
            remain on a separate edge rail so the image plane stays quiet and unobstructed.
          </p>
          <LabStatus />
        </div>

        <nav className={styles.frameNav} aria-label="Jump to a Quiet Focus frame">
          <p>Frame index</p>
          <ol>
            {frames.map((frame) => (
              <li key={frame.number}>
                <a
                  href={`#quiet-focus-frame-${frame.number}`}
                  aria-label={`Go to frame ${frame.number}: ${frame.title}`}
                >
                  <span>{frame.number}</span>
                  {frame.chapter}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <section
        className={styles.sequence}
        aria-labelledby="quiet-focus-sequence-title"
        tabIndex={0}
      >
        <div className={styles.sequenceHeading}>
          <p>01—05 / VERTICAL FRAME REGISTER</p>
          <h2 id="quiet-focus-sequence-title">A full-screen sequential focus study</h2>
        </div>

        {frames.map((frame, index) => {
          const frameId = `quiet-focus-frame-${frame.number}`;
          const titleId = `${frameId}-title`;
          const ratio = prototype.slotRatios[index];
          const nextFrame = frames[index + 1];

          return (
            <article
              id={frameId}
              className={styles.frame}
              key={frame.number}
              tabIndex={0}
              aria-labelledby={titleId}
            >
              <div className={styles.imagePlane}>
                <LabPlaceholder
                  index={index}
                  label={`${frame.chapter}: ${frame.title}`}
                  ratio={ratio}
                  className={styles.framePlaceholder}
                />
              </div>

              <div className={styles.captionRail}>
                <div className={styles.frameRegister} aria-hidden="true">
                  <span>{frame.number}</span>
                  <span>{String(frames.length).padStart(2, "0")}</span>
                </div>
                <div className={styles.captionCopy}>
                  <p>{frame.chapter}</p>
                  <h3 id={titleId}>{frame.title}</h3>
                  <p>{frame.subtitle}</p>
                  <p>{frame.note}</p>
                </div>
                {nextFrame ? (
                  <a
                    className={styles.nextFrame}
                    href={`#quiet-focus-frame-${nextFrame.number}`}
                    aria-label={`Continue to frame ${nextFrame.number}: ${nextFrame.title}`}
                  >
                    Next frame <span aria-hidden="true">↓ {nextFrame.number}</span>
                  </a>
                ) : (
                  <a className={styles.nextFrame} href="#quiet-focus-sequence-title">
                    Sequence index <span aria-hidden="true">↑</span>
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </section>

        <LabBrief prototype={prototype} />
      </main>
    </>
  );
}
