import {
  LEGACY_SITE_SETTINGS_MIGRATION_KEY,
  type AssetId,
  type LegacySlotAssetCandidate,
  type SiteId,
} from "../../app/stable-id-migration";

declare const siteId: SiteId;
declare const assetId: AssetId;

const candidate: LegacySlotAssetCandidate = {
  slot: {
    templateId: "cinematic-light",
    templateVersion: 1,
    slotIndex: 0,
  },
  sourceFingerprint: "a".repeat(64),
};

void siteId;
void assetId;
void candidate;

// @ts-expect-error A migration source locator is not a Site ID.
const migrationKeyAsSiteId: SiteId = LEGACY_SITE_SETTINGS_MIGRATION_KEY;

// @ts-expect-error A Site ID cannot be reused as an Asset ID.
const siteIdAsAssetId: AssetId = siteId;

const pathCandidate: LegacySlotAssetCandidate = {
  slot: candidate.slot,
  sourceFingerprint: null,
  // @ts-expect-error Legacy paths are not part of slot identity or ID generation input.
  path: "/private/source.jpg",
};

const workCandidate: LegacySlotAssetCandidate = {
  slot: candidate.slot,
  sourceFingerprint: null,
  // @ts-expect-error Display work codes are not part of the migration identity contract.
  workCode: "DISPLAY-01",
};

void migrationKeyAsSiteId;
void siteIdAsAssetId;
void pathCandidate;
void workCandidate;
