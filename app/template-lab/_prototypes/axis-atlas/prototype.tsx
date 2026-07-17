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

const prototype = getLabPrototype("axis-atlas");
const atlasEntries = labDemoSeries.slice(0, 9);
const styles = createInlineCssModule(prototypeCss);

const seriesDefinitions = [
  {
    id: "presence",
    coordinate: "Y01",
    name: "Presence",
    summary: "Arrival, expression, and gesture establish the figure before the atlas widens.",
  },
  {
    id: "evidence",
    coordinate: "Y02",
    name: "Evidence",
    summary: "Material, environment, and a responding pose test the middle distance.",
  },
  {
    id: "residue",
    coordinate: "Y03",
    name: "Residue",
    summary: "Color, return, and afterimage preserve what remains at the edge of the scene.",
  },
] as const;

export default function AxisAtlasPrototype() {
  return (
    <>
      <style data-template-lab-style={prototype.id}>{prototypeCss}</style>
      <main
        id="lab-content"
        className={styles.root}
        data-lab-prototype="axis-atlas"
        data-browsing-model={prototype.browsingModel}
      >
      <header className={styles.masthead}>
        <div className={styles.mastheadTopline}>
          <LabBackLink />
          <p>STAGE B · STUDY 04 · COORDINATES Y01—Y03 / X01—X03</p>
        </div>

        <div className={styles.titleGrid}>
          <p className={styles.eyebrow}>SEMANTIC TWO-AXIS PHOTOGRAPHY ATLAS</p>
          <h1>Axis Atlas</h1>
          <p className={styles.dek}>
            Move down the document to change series. Within each bounded series, move sideways
            through exactly three ordered photographs. Coordinates describe meaning, never random
            placement.
          </p>
        </div>

        <nav className={styles.seriesNav} aria-label="Axis Atlas Y-axis series navigation">
          {seriesDefinitions.map((series) => (
            <a key={series.id} href={`#axis-atlas-${series.id}`}>
              <span>{series.coordinate}</span>
              <strong>{series.name}</strong>
              <small>Jump to series ↓</small>
            </a>
          ))}
        </nav>

        <LabStatus />
      </header>

      <section className={styles.atlas} aria-labelledby="axis-atlas-heading">
        <div className={styles.atlasIntro}>
          <p>ATLAS FIELD / 3 × 3</p>
          <h2 id="axis-atlas-heading">Three series.<br />Two native axes.</h2>
          <p>
            The page keeps its ordinary vertical reading order. Each chapter contains one
            independently focusable, horizontally scrollable strip with a visible start and end.
          </p>
        </div>

        {seriesDefinitions.map((series, seriesIndex) => {
          const entries = atlasEntries.slice(seriesIndex * 3, seriesIndex * 3 + 3);
          const headingId = `axis-atlas-${series.id}-heading`;
          const stripId = `axis-atlas-${series.id}-strip`;

          return (
            <section
              key={series.id}
              id={`axis-atlas-${series.id}`}
              className={styles.series}
              aria-labelledby={headingId}
            >
              <header className={styles.seriesHeader}>
                <div className={styles.yCoordinate} aria-hidden="true">
                  <span>Y</span>
                  <strong>{series.coordinate.slice(1)}</strong>
                </div>
                <div>
                  <p>{series.coordinate} / SERIES</p>
                  <h3 id={headingId}>{series.name}</h3>
                </div>
                <p>{series.summary}</p>
              </header>

              <div className={styles.axisCue} aria-hidden="true">
                <span>X01 · START</span>
                <span>Native horizontal scroll / snap</span>
                <span>X03 · END</span>
              </div>

              <ol
                id={stripId}
                className={styles.strip}
                tabIndex={0}
                aria-label={`${series.coordinate} ${series.name}: horizontal strip, three frames from X01 start to X03 end`}
              >
                {entries.map((entry, frameIndex) => {
                  const globalIndex = seriesIndex * 3 + frameIndex;
                  const ratio = prototype.slotRatios[globalIndex] ?? "3:2";
                  const xCoordinate = `X${String(frameIndex + 1).padStart(2, "0")}`;

                  return (
                    <li key={entry.number} className={styles.frame}>
                      <article aria-label={`${series.coordinate} ${xCoordinate}: ${entry.title}`}>
                        <figure>
                          <LabPlaceholder
                            className={styles.photoPlaceholder}
                            index={globalIndex}
                            label={`${series.name}, ${xCoordinate}: ${entry.title}`}
                            ratio={ratio}
                          />
                          <figcaption>
                            <div className={styles.coordinate}>
                              <span>{series.coordinate}</span>
                              <span>{xCoordinate}</span>
                              <span>{ratio}</span>
                            </div>
                            <div className={styles.captionCopy}>
                              <p>{entry.chapter} · {entry.subtitle}</p>
                              <strong>{entry.title}</strong>
                              <p>{entry.note}</p>
                            </div>
                          </figcaption>
                        </figure>
                      </article>
                    </li>
                  );
                })}
              </ol>

              <div className={styles.seriesFooter}>
                <span>{series.coordinate} / X01 START</span>
                <a href={`#${stripId}`}>Focus this strip <span aria-hidden="true">↗</span></a>
                <span>{series.coordinate} / X03 END</span>
              </div>
            </section>
          );
        })}
      </section>

        <LabBrief prototype={prototype} />
      </main>
    </>
  );
}
