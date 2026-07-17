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

const prototype = getLabPrototype("stacked-scenes");
const scenes = labDemoSeries.slice(0, 5);
const styles = createInlineCssModule(prototypeCss);
const layerClasses = [
  styles.layerOne,
  styles.layerTwo,
  styles.layerThree,
  styles.layerFour,
  styles.layerFive,
] as const;

export function StackedScenesPrototype() {
  return (
    <>
      <style data-template-lab-style={prototype.id}>{prototypeCss}</style>
      <main
        id="lab-content"
        className={styles.prototype}
        data-lab-prototype="stacked-scenes"
        data-browsing-model={prototype.browsingModel}
      >
      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <LabBackLink />
          <p>STAGE {prototype.stage} / {prototype.status}</p>
        </div>

        <div className={styles.heroBody}>
          <p className={styles.eyebrow}>FRAME//ZERO / ORDERED FIVE-SCENE STUDY</p>
          <h1>{prototype.name}</h1>
          <p className={styles.heroSummary}>
            Five photographic scenes collect into a deliberate card stack. Every new scene arrives
            in document order, while its caption remains in a separate reading panel outside the
            image plane.
          </p>
          <LabStatus />
        </div>

        <nav className={styles.sceneNav} aria-label="Stacked scene navigation">
          <p>Scene index</p>
          <ol>
            {scenes.map((scene) => (
              <li key={scene.number}>
                <a
                  href={`#stacked-scene-${scene.number}`}
                  aria-label={`Go to scene ${scene.number}: ${scene.title}`}
                >
                  <span>{scene.number}</span>
                  {scene.chapter}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <section className={styles.sequence} aria-labelledby="stacked-scenes-sequence-title">
        <header className={styles.sequenceIntro}>
          <p>STACK REGISTER / 01-05</p>
          <h2 id="stacked-scenes-sequence-title">An ordered stack with five distinct layers</h2>
          <p>
            Scroll to place each scene above the last. On narrow screens, the same sequence becomes
            a straightforward vertical document with no pinned layers.
          </p>
        </header>

        <div className={styles.stack}>
          {scenes.map((scene, index) => {
            const sceneId = `stacked-scene-${scene.number}`;
            const titleId = `${sceneId}-title`;
            const ratio = prototype.slotRatios[index] ?? prototype.slotRatios[0];
            const previousScene = scenes[index - 1];
            const nextScene = scenes[index + 1];

            return (
              <article
                id={sceneId}
                className={`${styles.scene} ${layerClasses[index] ?? styles.layerOne}`}
                key={scene.number}
                tabIndex={0}
                aria-labelledby={titleId}
              >
                <header className={styles.sceneHeader}>
                  <p>SCENE {scene.number} / {String(scenes.length).padStart(2, "0")}</p>
                  <p>{scene.subtitle}</p>
                </header>

                <div className={styles.sceneBody}>
                  <div className={styles.mediaField}>
                    <LabPlaceholder
                      index={index}
                      label={`${scene.chapter}: ${scene.title}`}
                      ratio={ratio}
                      className={styles.scenePlaceholder}
                    />
                  </div>

                  <div className={styles.captionPanel}>
                    <p className={styles.sceneNumber} aria-hidden="true">{scene.number}</p>
                    <div className={styles.captionCopy}>
                      <p>{scene.chapter}</p>
                      <h3 id={titleId}>{scene.title}</h3>
                      <p>{scene.note}</p>
                    </div>
                    <dl className={styles.sceneFacts}>
                      <div>
                        <dt>Frame</dt>
                        <dd>{ratio}</dd>
                      </div>
                      <div>
                        <dt>Layer</dt>
                        <dd>{index + 1} of {scenes.length}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <footer className={styles.sceneFooter}>
                  {previousScene ? (
                    <a href={`#stacked-scene-${previousScene.number}`}>
                      <span aria-hidden="true">^</span> Previous {previousScene.number}
                    </a>
                  ) : (
                    <a href="#stacked-scenes-sequence-title">
                      <span aria-hidden="true">^</span> Stack introduction
                    </a>
                  )}
                  {nextScene ? (
                    <a href={`#stacked-scene-${nextScene.number}`}>
                      Next {nextScene.number} <span aria-hidden="true">v</span>
                    </a>
                  ) : (
                    <a href="#stacked-scenes-sequence-title">
                      Stack index <span aria-hidden="true">^</span>
                    </a>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      </section>

        <LabBrief prototype={prototype} />
      </main>
    </>
  );
}
