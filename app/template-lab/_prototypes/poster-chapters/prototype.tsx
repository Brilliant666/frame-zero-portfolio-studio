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

const prototype = getLabPrototype("poster-chapters");
const chapters = labDemoSeries.slice(0, prototype.slotRatios.length);
const styles = createInlineCssModule(prototypeCss);

function getChapterVariant(index: number) {
  if (index % 3 === 1) return styles.typeRight;
  if (index % 3 === 2) return styles.typeHorizon;
  return styles.typeLeft;
}

export function PosterChaptersPrototype() {
  return (
    <>
      <style data-template-lab-style={prototype.id}>{prototypeCss}</style>
      <main
        id="lab-content"
        className={styles.prototype}
        data-lab-prototype="poster-chapters"
        data-browsing-model={prototype.browsingModel}
      >
      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <LabBackLink />
          <p>STAGE {prototype.stage} · {prototype.status}</p>
        </div>

        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>FRAME//ZERO · SIX POSTER-SCALE CHAPTERS</p>
          <h1>{prototype.name}</h1>
          <p>
            A vertical exhibition sequence where type establishes orientation from a dedicated
            edge, while each photographic field keeps its central focal plane unobstructed.
          </p>
          <LabStatus />
        </div>

        <nav className={styles.chapterNav} aria-label="Poster chapter navigation">
          <p>Chapter index</p>
          <ol>
            {chapters.map((chapter) => (
              <li key={chapter.number}>
                <a
                  href={`#poster-chapter-${chapter.number}`}
                  aria-label={`Go to chapter ${chapter.number}: ${chapter.title}`}
                >
                  <span>{chapter.number}</span>
                  {chapter.chapter}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <section className={styles.chapters} aria-labelledby="poster-chapters-sequence-title">
        <header className={styles.sequenceIntro}>
          <p>POSTER REGISTER · 01—06</p>
          <h2 id="poster-chapters-sequence-title">Six chapters, six spatial readings</h2>
        </header>

        {chapters.map((chapter, index) => {
          const chapterId = `poster-chapter-${chapter.number}`;
          const titleId = `${chapterId}-title`;
          const ratio = prototype.slotRatios[index] ?? prototype.slotRatios[0];
          const nextChapter = chapters[index + 1];

          return (
            <article
              id={chapterId}
              className={`${styles.chapter} ${getChapterVariant(index)}`}
              key={chapter.number}
              tabIndex={0}
              aria-labelledby={titleId}
            >
              <header className={styles.chapterType}>
                <p>
                  CHAPTER <span>{chapter.number}</span>
                </p>
                <h3 id={titleId}>{chapter.chapter}</h3>
                <p>{chapter.title}</p>
              </header>

              <div className={styles.mediaField}>
                <LabPlaceholder
                  index={index}
                  label={`${chapter.chapter}: ${chapter.title}`}
                  ratio={ratio}
                  className={styles.posterPlaceholder}
                />
              </div>

              <div className={styles.accentBand} aria-hidden="true">
                <span>{chapter.number}</span>
              </div>

              <footer className={styles.chapterNotes}>
                <div>
                  <p>{chapter.subtitle}</p>
                  <p>{chapter.note}</p>
                </div>
                {nextChapter ? (
                  <a
                    href={`#poster-chapter-${nextChapter.number}`}
                    aria-label={`Continue to chapter ${nextChapter.number}: ${nextChapter.title}`}
                  >
                    Next chapter <span aria-hidden="true">↓ {nextChapter.number}</span>
                  </a>
                ) : (
                  <a href="#poster-chapters-sequence-title">
                    Chapter index <span aria-hidden="true">↑</span>
                  </a>
                )}
              </footer>
            </article>
          );
        })}
      </section>

        <LabBrief prototype={prototype} />
      </main>
    </>
  );
}
