export const LAB_STATUS_LABELS = [
  "EXPERIMENTAL",
  "NOT REGISTERED",
  "NOT SITE_DOCUMENT_V1 COMPATIBLE",
  "DO NOT PERSIST",
] as const;

export const labPrototypeCatalog = [
  {
    id: "quiet-focus",
    name: "Quiet Focus",
    stage: "A",
    status: "RUNNABLE PROTOTYPE",
    route: "/template-lab/quiet-focus",
    slotRatios: ["16:9", "2:3", "3:2", "2:3", "16:9"],
    browsingModel: "Full-screen sequential focus",
    direction: "One photograph, one caption rail, and one deliberate next step per viewport.",
    desktop: "Viewport sequence with a persistent frame index and edge captions.",
    tablet: "Narrower caption rail with the same one-frame reading order.",
    mobile: "Native vertical snap with captions below the image plane.",
    structureKey: "focus-sequence-with-edge-register",
    tokenKey: "carbon-bone-cobalt-signal",
  },
  {
    id: "split-register",
    name: "Split Register",
    stage: "A",
    status: "RUNNABLE PROTOTYPE",
    route: "/template-lab/split-register",
    slotRatios: ["2:3", "3:2", "3:2", "16:9", "2:3", "3:2", "16:9", "2:3"],
    browsingModel: "Split-column indexed directory",
    direction: "A numbered register and an image ledger remain semantically equal.",
    desktop: "Sticky directory beside a ruled image ledger and annotation column.",
    tablet: "Compact directory beside a single image-and-note track.",
    mobile: "Wrapped jump index followed by the complete document-order ledger.",
    structureKey: "directory-ledger-with-annotation-track",
    tokenKey: "chalk-ink-vermilion-rule",
  },
  {
    id: "poster-chapters",
    name: "Poster Chapters",
    stage: "B",
    status: "RUNNABLE PROTOTYPE",
    route: "/template-lab/poster-chapters",
    slotRatios: ["2:3", "16:9", "3:2", "2:3", "16:9", "3:2"],
    browsingModel: "Poster-led vertical chapter scroll",
    direction: "Each chapter is a photographic poster whose typography also provides orientation.",
    desktop: "Six viewport-scale chapters alternate type, image, and edge navigation positions.",
    tablet: "Poster geometry simplifies while chapter identity and image priority remain intact.",
    mobile: "Text moves into dedicated bands above or below media so focal areas stay clear.",
    structureKey: "vertical-poster-chapters-with-edge-index",
    tokenKey: "paper-black-safety-red-electric-lime",
  },
  {
    id: "axis-atlas",
    name: "Axis Atlas",
    stage: "B",
    status: "RUNNABLE PROTOTYPE",
    route: "/template-lab/axis-atlas",
    slotRatios: ["2:3", "3:2", "16:9", "2:3", "3:2", "16:9", "2:3", "3:2", "16:9"],
    browsingModel: "Semantic two-axis photography atlas",
    direction: "Vertical series form one axis; bounded, focusable image strips form the second.",
    desktop: "Three vertical chapters each expose a horizontal three-frame coordinate strip.",
    tablet: "Shorter strips keep explicit start/end cues and native scrolling.",
    mobile: "Document scroll selects a series; contained horizontal snap browses its three frames.",
    structureKey: "vertical-series-with-horizontal-coordinate-strips",
    tokenKey: "deep-blue-parchment-cyan-coral-coordinate",
  },
  {
    id: "stacked-scenes",
    name: "Stacked Scenes",
    stage: "C",
    status: "RUNNABLE PROTOTYPE",
    route: "/template-lab/stacked-scenes",
    slotRatios: ["16:9", "2:3", "3:2", "2:3", "16:9"],
    browsingModel: "Ordered sticky card stack",
    direction: "Five photographic scenes accumulate in order, then hand context to the next card.",
    desktop: "Viewport-scale cards rise along a measured sticky spine and remain in document order.",
    tablet: "Reduced offsets preserve the layered handoff without hiding captions or navigation.",
    mobile: "Sticky behavior releases into a complete single-column scene sequence.",
    structureKey: "ordered-sticky-scene-stack-with-handoffs",
    tokenKey: "night-ivory-amber-plum-depth",
  },
] as const;

export type LabPrototype = (typeof labPrototypeCatalog)[number];
export type LabPrototypeId = LabPrototype["id"];

export function getLabPrototype(prototypeId: LabPrototypeId): LabPrototype {
  const prototype = labPrototypeCatalog.find((entry) => entry.id === prototypeId);
  if (!prototype) throw new Error(`Unknown Template Lab prototype: ${prototypeId}`);
  return prototype;
}
