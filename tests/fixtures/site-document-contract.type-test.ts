import type {
  SiteDocumentV1,
  SiteDocumentV1TemplateId,
  SlotComposition,
} from "../../app/site-document";

export const frozenTemplateIdentity: SiteDocumentV1TemplateId = "museum-depth";

// @ts-expect-error A runtime-only or future template is not part of schemaVersion 1.
export const futureTemplateIdentity: SiteDocumentV1TemplateId = "future-template";

export const validDocument = {
  schemaVersion: 1,
  activeTemplate: "cinematic-light",
  profile: {
    brand: "FRAME//ZERO",
    mark: "F//0",
    photographer: "Demo photographer",
    role: "Cosplay photographer",
    city: "Demo city",
    availability: "Available by appointment",
    intro: "A fictional portfolio used for contract validation.",
  },
  hero: {
    eyebrow: "COSPLAY PHOTOGRAPHY",
    title: "BREAK THE FRAME",
    services: "Convention coverage / private sessions",
  },
  trustItems: [],
  packages: [],
  contact: {
    wechat: "FRAMEZERO_DEMO",
    email: "booking@framezero.example",
    note: "Fictional contact details",
  },
  social: [],
  bookingFields: [],
  statement: {
    eyebrow: "PHOTOGRAPHY IS NOT PROOF.",
    lineOne: "It is evidence",
    lineTwo: "that a character existed.",
  },
  compositions: {},
} satisfies SiteDocumentV1;

export const futureActiveTemplateMustStayOut: SiteDocumentV1 = {
  ...validDocument,
  // @ts-expect-error SiteDocumentV1.activeTemplate is closed for schemaVersion 1.
  activeTemplate: "future-template",
};

export const futureCompositionMustStayOut: SiteDocumentV1 = {
  ...validDocument,
  compositions: {
    // @ts-expect-error Composition keys use the frozen V1 template identity set.
    "future-template": { templateVersion: 1, slots: [] },
  },
};

export const tenantIdentityMustStayOut: SiteDocumentV1 = {
  ...validDocument,
  // @ts-expect-error Tenant identity belongs to the Site or revision envelope.
  siteId: "source-site",
};

export const legacyWorksMustStayOut: SiteDocumentV1 = {
  ...validDocument,
  // @ts-expect-error Legacy path-based works are not part of SiteDocumentV1.
  works: [{ image: "/photos/full.webp", preview: "/photos/card.webp" }],
};

export const resolvedAssetDataMustStayOut: SlotComposition = {
  slotIndex: 0,
  assetId: "asset-01",
  locked: false,
  focus: { x: 50, y: 50 },
  // @ts-expect-error Resolved URLs belong to the future AssetResolver.
  image: "/photos/full.webp",
};

export const themeMustWaitForSemantics: SiteDocumentV1 = {
  ...validDocument,
  // @ts-expect-error Theme overrides are not executable in the V1 contract.
  theme: { accent: "#ff6b00" },
};
