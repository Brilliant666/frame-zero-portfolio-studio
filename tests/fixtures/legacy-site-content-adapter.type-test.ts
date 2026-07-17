import {
  adaptLegacySiteContentToSiteDocumentV1,
  LEGACY_SITE_CONTENT_TEMPLATE_SPECS,
  type LegacySiteContentAssetSnapshot,
  type LegacySiteContentAdapterResult,
} from "../../app/legacy-site-content-adapter";
import type { SiteDocumentV1 } from "../../app/site-document";

declare const rawLegacyJson: unknown;
declare const readonlySnapshot: LegacySiteContentAssetSnapshot;

const snapshot = {
  siteId: "11111111-1111-4111-8111-111111111111",
  templates: [{
    templateId: "cinematic-light",
    templateVersion: 1,
    mode: "fallback",
    slots: [{
      source: { collection: "works", workIndex: 0 },
      slotIndex: 0,
      resolution: {
        status: "resolved",
        assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    }],
  }],
} as const satisfies LegacySiteContentAssetSnapshot;

const unresolvedSnapshot = {
  siteId: snapshot.siteId,
  templates: [{
    templateId: "cinematic-light",
    templateVersion: 1,
    mode: "explicit",
    slots: [{
      source: { collection: "templateWorks", workIndex: 0 },
      slotIndex: 0,
      resolution: {
        status: "unresolved",
        reason: "missing_source_fingerprint",
      },
    }],
  }],
} as const satisfies LegacySiteContentAssetSnapshot;

export const result: LegacySiteContentAdapterResult =
  adaptLegacySiteContentToSiteDocumentV1(rawLegacyJson, snapshot);
export const unresolvedResult: LegacySiteContentAdapterResult =
  adaptLegacySiteContentToSiteDocumentV1(rawLegacyJson, unresolvedSnapshot);

if (result.status === "ready") {
  const document: SiteDocumentV1 = result.document;
  void document;
  void result.errors;
  void result.unresolved;
} else if (result.status === "blocked-by-unresolved") {
  const preview: SiteDocumentV1 = result.documentPreview;
  const unresolved = result.unresolved[0];
  void preview;
  void unresolved.code;
} else {
  const noDocument: null = result.document;
  const error = result.errors[0];
  void noDocument;
  void error.code;
}

const specsVersion: 1 = LEGACY_SITE_CONTENT_TEMPLATE_SPECS["museum-depth"].templateVersion;
const specsCapacity: number = LEGACY_SITE_CONTENT_TEMPLATE_SPECS["archive-os"].slotCount;
void specsVersion;
void specsCapacity;

// Deep readonly is part of the caller-provided snapshot contract.
// @ts-expect-error Snapshot template arrays are readonly.
readonlySnapshot.templates.push(readonlySnapshot.templates[0]);
// @ts-expect-error Snapshot template values are readonly.
readonlySnapshot.templates[0].mode = "explicit";
// @ts-expect-error Snapshot slot arrays are readonly.
readonlySnapshot.templates[0].slots.push(readonlySnapshot.templates[0].slots[0]);
// @ts-expect-error Structured source locations are readonly.
readonlySnapshot.templates[0].slots[0].source.workIndex = 2;
const firstResolution = readonlySnapshot.templates[0].slots[0].resolution;
if (firstResolution.status === "resolved") {
  // @ts-expect-error Resolutions are readonly.
  firstResolution.assetId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
}

const invalidVersionSnapshot = {
  siteId: snapshot.siteId,
  templates: [{
    templateId: "cinematic-light",
    // @ts-expect-error Legacy template compatibility is frozen at version 1.
    templateVersion: 2,
    mode: "fallback",
    slots: [],
  }],
} satisfies LegacySiteContentAssetSnapshot;
void invalidVersionSnapshot;

// @ts-expect-error The pure adapter must not accept a UUID generator or other execution dependency.
adaptLegacySiteContentToSiteDocumentV1(rawLegacyJson, snapshot, () => crypto.randomUUID());

// @ts-expect-error Adapter diagnostics are readonly outputs.
result.warnings.push({ code: "new-warning", paths: [], count: 0, message: "mutation" });
