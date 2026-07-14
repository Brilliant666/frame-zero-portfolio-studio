import { randomUUID } from "node:crypto";
import {
  isSiteDocumentV1TemplateId,
  type SiteDocumentV1TemplateId,
} from "./site-document";

export const LEGACY_SITE_SETTINGS_MIGRATION_KEY = "legacy:site_settings:1" as const;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_SLOT_INDEX = 255;

declare const siteIdBrand: unique symbol;
declare const assetIdBrand: unique symbol;

/** Internal, immutable Site identity. It is never derived from a display field. */
export type SiteId = string & { readonly [siteIdBrand]: "SiteId" };

/** Internal Asset identity. Public URL encoding remains an ADR-0008 decision. */
export type AssetId = string & { readonly [assetIdBrand]: "AssetId" };

export type LegacyMigrationStatus = "pending" | "completed";

export type PersistedLegacySiteMigrationCheckpoint = {
  migrationKey: string;
  siteId: string;
  status: LegacyMigrationStatus | string;
};

export type LegacySlotIdentity = {
  templateId: SiteDocumentV1TemplateId;
  templateVersion: number;
  slotIndex: number;
};

export type LegacySlotAssetCandidate = {
  slot: LegacySlotIdentity;
  /** Private legacy/source SHA-256 fingerprint; never an Asset ID. */
  sourceFingerprint: string | null;
};

export type PersistedLegacyAssetMapping = {
  siteId: string;
  sourceFingerprint: string;
  assetId: string;
};

export type StableIdMigrationConflictCode =
  | "asset_id_generation_failed"
  | "asset_mapping_conflict"
  | "duplicate_checkpoint"
  | "duplicate_slot"
  | "fingerprint_mapping_conflict"
  | "invalid_asset_id"
  | "invalid_checkpoint_status"
  | "invalid_generated_asset_id"
  | "invalid_generated_site_id"
  | "invalid_migration_mode"
  | "invalid_site_id"
  | "invalid_slot_identity"
  | "invalid_source_fingerprint"
  | "migration_key_mismatch"
  | "site_id_generation_failed";

export type StableIdMigrationConflict = {
  code: StableIdMigrationConflictCode;
  path: string;
  message: string;
};

type MigrationFailure = {
  success: false;
  conflicts: StableIdMigrationConflict[];
};

type ValidCheckpoint = {
  migrationKey: typeof LEGACY_SITE_SETTINGS_MIGRATION_KEY;
  siteId: SiteId;
  status: LegacyMigrationStatus;
};

export type LegacySiteMigrationStartPlan =
  | {
      action: "dry-run";
      migrationKey: typeof LEGACY_SITE_SETTINGS_MIGRATION_KEY;
      persistedStatus: LegacyMigrationStatus | null;
      siteId: SiteId | null;
    }
  | {
      action: "persist-pending";
      checkpoint: ValidCheckpoint;
      migrationKey: typeof LEGACY_SITE_SETTINGS_MIGRATION_KEY;
      siteId: SiteId;
    }
  | {
      action: "resume";
      checkpoint: ValidCheckpoint;
      migrationKey: typeof LEGACY_SITE_SETTINGS_MIGRATION_KEY;
      siteId: SiteId;
    }
  | {
      action: "noop";
      checkpoint: ValidCheckpoint;
      migrationKey: typeof LEGACY_SITE_SETTINGS_MIGRATION_KEY;
      siteId: SiteId;
    };

export type LegacyAssetAssignment = {
  slot: LegacySlotIdentity;
  assetId: AssetId;
  disposition: "generated" | "reused";
};

export type LegacyUnresolvedAsset = {
  slot: LegacySlotIdentity;
  reason: "missing_source_fingerprint";
};

export type CompletedLegacySiteMigrationCheckpoint = {
  migrationKey: typeof LEGACY_SITE_SETTINGS_MIGRATION_KEY;
  siteId: SiteId;
  status: "completed";
};

export type LegacyAssetMigrationCompletion =
  | {
      status: "ready-to-complete";
      nextCheckpoint: CompletedLegacySiteMigrationCheckpoint;
    }
  | {
      status: "blocked-by-unresolved";
      nextCheckpoint: null;
    };

export type LegacyAssetMigrationPlan =
  | {
      action: "map-assets";
      assignments: LegacyAssetAssignment[];
      completion: LegacyAssetMigrationCompletion;
      migrationKey: typeof LEGACY_SITE_SETTINGS_MIGRATION_KEY;
      newMappings: Array<{
        siteId: SiteId;
        sourceFingerprint: string;
        assetId: AssetId;
      }>;
      siteId: SiteId;
      unresolved: LegacyUnresolvedAsset[];
    }
  | {
      action: "noop";
      migrationKey: typeof LEGACY_SITE_SETTINGS_MIGRATION_KEY;
      siteId: SiteId;
    };

type UuidV4Factory = () => string;

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function generateUuidV4(): string {
  const value = randomUUID();
  if (!isUuidV4(value)) {
    throw new Error("The server runtime did not provide an RFC 4122 UUID v4.");
  }
  return value;
}

function failure(conflicts: StableIdMigrationConflict[]): MigrationFailure {
  return { success: false, conflicts };
}

function conflict(
  code: StableIdMigrationConflictCode,
  path: string,
  message: string,
): StableIdMigrationConflict {
  return { code, path, message };
}

function validateCheckpoint(
  value: PersistedLegacySiteMigrationCheckpoint,
  path: string,
): { checkpoint: ValidCheckpoint | null; conflicts: StableIdMigrationConflict[] } {
  const conflicts: StableIdMigrationConflict[] = [];

  if (value.migrationKey !== LEGACY_SITE_SETTINGS_MIGRATION_KEY) {
    conflicts.push(conflict(
      "migration_key_mismatch",
      `${path}.migrationKey`,
      `Expected migration key ${LEGACY_SITE_SETTINGS_MIGRATION_KEY}.`,
    ));
  }
  if (!isUuidV4(value.siteId)) {
    conflicts.push(conflict(
      "invalid_site_id",
      `${path}.siteId`,
      "Persisted Site ID must be an RFC 4122 UUID v4.",
    ));
  }
  if (value.status !== "pending" && value.status !== "completed") {
    conflicts.push(conflict(
      "invalid_checkpoint_status",
      `${path}.status`,
      "Checkpoint status must be pending or completed.",
    ));
  }

  if (conflicts.length > 0) return { checkpoint: null, conflicts };
  return {
    checkpoint: {
      migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
      siteId: value.siteId as SiteId,
      status: value.status as LegacyMigrationStatus,
    },
    conflicts,
  };
}

/**
 * Plans the first migration transition only. A `persist-pending` result must be
 * durably written and read back before asset planning begins. The function
 * deliberately does not accept slug, domain, user, path, legacy row ID, or
 * fingerprint input, so none can influence Site ID generation.
 */
export function planLegacySiteMigrationStart(
  input: {
    mode: "dry-run" | "apply" | string;
    persistedCheckpoints: readonly PersistedLegacySiteMigrationCheckpoint[];
  },
  generateSiteId: UuidV4Factory = generateUuidV4,
): { success: true; plan: LegacySiteMigrationStartPlan } | MigrationFailure {
  if (input.mode !== "dry-run" && input.mode !== "apply") {
    return failure([conflict(
      "invalid_migration_mode",
      "$.mode",
      "Migration mode must be dry-run or apply.",
    )]);
  }

  if (input.persistedCheckpoints.length > 1) {
    return failure([conflict(
      "duplicate_checkpoint",
      "$.persistedCheckpoints",
      "A migration key must resolve to at most one persisted checkpoint.",
    )]);
  }

  const persisted = input.persistedCheckpoints[0];
  let checkpoint: ValidCheckpoint | null = null;
  if (persisted) {
    const validated = validateCheckpoint(persisted, "$.persistedCheckpoints[0]");
    if (validated.conflicts.length > 0) return failure(validated.conflicts);
    checkpoint = validated.checkpoint;
  }

  if (input.mode === "dry-run") {
    return {
      success: true,
      plan: {
        action: "dry-run",
        migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
        persistedStatus: checkpoint?.status ?? null,
        siteId: checkpoint?.siteId ?? null,
      },
    };
  }

  if (checkpoint?.status === "completed") {
    return {
      success: true,
      plan: {
        action: "noop",
        checkpoint,
        migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
        siteId: checkpoint.siteId,
      },
    };
  }
  if (checkpoint?.status === "pending") {
    return {
      success: true,
      plan: {
        action: "resume",
        checkpoint,
        migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
        siteId: checkpoint.siteId,
      },
    };
  }

  let generated: string;
  try {
    generated = generateSiteId();
  } catch (error) {
    return failure([conflict(
      "site_id_generation_failed",
      "$.siteId",
      error instanceof Error ? error.message : "Site ID generation failed.",
    )]);
  }
  if (!isUuidV4(generated)) {
    return failure([conflict(
      "invalid_generated_site_id",
      "$.siteId",
      "The Site ID generator must return an RFC 4122 UUID v4.",
    )]);
  }

  const pendingCheckpoint: ValidCheckpoint = {
    migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
    siteId: generated as SiteId,
    status: "pending",
  };
  return {
    success: true,
    plan: {
      action: "persist-pending",
      checkpoint: pendingCheckpoint,
      migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
      siteId: pendingCheckpoint.siteId,
    },
  };
}

function slotKey(slot: LegacySlotIdentity) {
  return `${slot.templateId}:${slot.templateVersion}:${slot.slotIndex}`;
}

function isValidSlotIdentity(slot: LegacySlotIdentity) {
  return isSiteDocumentV1TemplateId(slot.templateId)
    && Number.isSafeInteger(slot.templateVersion)
    && slot.templateVersion >= 1
    && Number.isSafeInteger(slot.slotIndex)
    && slot.slotIndex >= 0
    && slot.slotIndex <= MAX_SLOT_INDEX;
}

/**
 * Plans private legacy fingerprint-to-Asset mappings after a pending
 * checkpoint has been persisted. It never reads files, writes a database,
 * changes the legacy manifest, or chooses a public URL/storage encoding.
 */
export function planLegacyAssetMigration(
  input: {
    checkpoint: PersistedLegacySiteMigrationCheckpoint;
    candidates: readonly LegacySlotAssetCandidate[];
    persistedMappings: readonly PersistedLegacyAssetMapping[];
  },
  generateAssetId: UuidV4Factory = generateUuidV4,
): { success: true; plan: LegacyAssetMigrationPlan } | MigrationFailure {
  const validatedCheckpoint = validateCheckpoint(input.checkpoint, "$.checkpoint");
  if (validatedCheckpoint.conflicts.length > 0 || !validatedCheckpoint.checkpoint) {
    return failure(validatedCheckpoint.conflicts);
  }
  const checkpoint = validatedCheckpoint.checkpoint;

  if (checkpoint.status === "completed") {
    return {
      success: true,
      plan: {
        action: "noop",
        migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
        siteId: checkpoint.siteId,
      },
    };
  }

  const conflicts: StableIdMigrationConflict[] = [];
  const byScopedFingerprint = new Map<string, AssetId>();
  const byAssetId = new Map<string, { siteId: string; sourceFingerprint: string }>();

  input.persistedMappings.forEach((mapping, index) => {
    const path = `$.persistedMappings[${index}]`;
    if (!isUuidV4(mapping.siteId)) {
      conflicts.push(conflict("invalid_site_id", `${path}.siteId`, "Mapping Site ID must be UUID v4."));
    }
    if (!LEGACY_SHA256_PATTERN.test(mapping.sourceFingerprint)) {
      conflicts.push(conflict(
        "invalid_source_fingerprint",
        `${path}.sourceFingerprint`,
        "Legacy source fingerprint must be a lowercase SHA-256 value.",
      ));
    }
    if (!isUuidV4(mapping.assetId)) {
      conflicts.push(conflict("invalid_asset_id", `${path}.assetId`, "Mapping Asset ID must be UUID v4."));
    }
    if (!isUuidV4(mapping.siteId)
      || !LEGACY_SHA256_PATTERN.test(mapping.sourceFingerprint)
      || !isUuidV4(mapping.assetId)) return;

    const scopedFingerprint = `${mapping.siteId}:${mapping.sourceFingerprint}`;
    const existingAssetId = byScopedFingerprint.get(scopedFingerprint);
    if (existingAssetId && existingAssetId !== mapping.assetId) {
      conflicts.push(conflict(
        "fingerprint_mapping_conflict",
        path,
        "One Site fingerprint cannot map to multiple Asset IDs.",
      ));
    } else {
      byScopedFingerprint.set(scopedFingerprint, mapping.assetId as AssetId);
    }

    const existingMapping = byAssetId.get(mapping.assetId);
    if (existingMapping
      && (existingMapping.siteId !== mapping.siteId
        || existingMapping.sourceFingerprint !== mapping.sourceFingerprint)) {
      conflicts.push(conflict(
        "asset_mapping_conflict",
        path,
        "One Asset ID cannot map to a different Site or fingerprint.",
      ));
    } else {
      byAssetId.set(mapping.assetId, {
        siteId: mapping.siteId,
        sourceFingerprint: mapping.sourceFingerprint,
      });
    }
  });

  const seenSlots = new Set<string>();
  input.candidates.forEach((candidate, index) => {
    const path = `$.candidates[${index}]`;
    if (!isValidSlotIdentity(candidate.slot)) {
      conflicts.push(conflict(
        "invalid_slot_identity",
        `${path}.slot`,
        "Slot identity requires a frozen V1 templateId, positive templateVersion, and slotIndex 0..255.",
      ));
      return;
    }
    const key = slotKey(candidate.slot);
    if (seenSlots.has(key)) {
      conflicts.push(conflict("duplicate_slot", `${path}.slot`, `Duplicate slot identity: ${key}.`));
    }
    seenSlots.add(key);

    if (candidate.sourceFingerprint !== null
      && !LEGACY_SHA256_PATTERN.test(candidate.sourceFingerprint)) {
      conflicts.push(conflict(
        "invalid_source_fingerprint",
        `${path}.sourceFingerprint`,
        "Legacy source fingerprint must be null or a lowercase SHA-256 value.",
      ));
    }
  });

  if (conflicts.length > 0) return failure(conflicts);

  const assignments: LegacyAssetAssignment[] = [];
  const newMappings: Array<{
    siteId: SiteId;
    sourceFingerprint: string;
    assetId: AssetId;
  }> = [];
  const unresolved: LegacyUnresolvedAsset[] = [];

  for (const [candidateIndex, candidate] of input.candidates.entries()) {
    const slot = { ...candidate.slot };
    if (candidate.sourceFingerprint === null) {
      unresolved.push({ slot, reason: "missing_source_fingerprint" });
      continue;
    }

    const scopedFingerprint = `${checkpoint.siteId}:${candidate.sourceFingerprint}`;
    const existingAssetId = byScopedFingerprint.get(scopedFingerprint);
    if (existingAssetId) {
      assignments.push({ slot, assetId: existingAssetId, disposition: "reused" });
      continue;
    }

    let generated: string;
    try {
      generated = generateAssetId();
    } catch (error) {
      return failure([conflict(
        "asset_id_generation_failed",
        `$.candidates[${candidateIndex}].assetId`,
        error instanceof Error ? error.message : "Asset ID generation failed.",
      )]);
    }
    if (!isUuidV4(generated)) {
      return failure([conflict(
        "invalid_generated_asset_id",
        `$.candidates[${candidateIndex}].assetId`,
        "The Asset ID generator must return an RFC 4122 UUID v4.",
      )]);
    }
    if (byAssetId.has(generated)) {
      return failure([conflict(
        "asset_mapping_conflict",
        `$.candidates[${candidateIndex}].assetId`,
        "The generated Asset ID already belongs to another mapping.",
      )]);
    }

    const assetId = generated as AssetId;
    byScopedFingerprint.set(scopedFingerprint, assetId);
    byAssetId.set(assetId, {
      siteId: checkpoint.siteId,
      sourceFingerprint: candidate.sourceFingerprint,
    });
    newMappings.push({
      siteId: checkpoint.siteId,
      sourceFingerprint: candidate.sourceFingerprint,
      assetId,
    });
    assignments.push({ slot, assetId, disposition: "generated" });
  }

  const completion: LegacyAssetMigrationCompletion = unresolved.length === 0
    ? {
        status: "ready-to-complete",
        nextCheckpoint: {
          migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
          siteId: checkpoint.siteId,
          status: "completed",
        },
      }
    : {
        status: "blocked-by-unresolved",
        nextCheckpoint: null,
      };

  return {
    success: true,
    plan: {
      action: "map-assets",
      assignments,
      completion,
      migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
      newMappings,
      siteId: checkpoint.siteId,
      unresolved,
    },
  };
}
