# Polaroid collection experience — local design proof

Status: `COLLECTION_DESIGN_PROOF_READY_FOR_HUMAN_REVIEW` once PR #26 checks pass.
Persistence: `COLLECTION_PERSISTENCE_NOT_IMPLEMENTED`.
Visual sign-off: `HUMAN_VISUAL_APPROVAL_PENDING`.

## Open the proof

Run `npm run dev`, then open `http://127.0.0.1:3001/?template=polaroid-field&collections=preview`. The `collections=preview` switch works only in a development build on a loopback hostname. The collapsed “栏目验证配置” panel holds all edits in React memory. Refreshing discards them. The explicit “填入测试分组（非真实分类）” action splits the current local Photo Library solely for interaction testing; it does **not** classify the photographer's real work. The three initial names are editable examples with no photo assignment. Without this switch, the existing nine-slot Polaroid experience remains unchanged.

The proof reads the existing local `/photos/library-manifest.json`, reuses its validated Asset IDs and variants, and makes no PUT/POST request. No real-photo manifest, photo, Asset ID, local file path, or generated image is committed with this record. Homepage cards are Collections, gallery items are Assets, and cover choice is an independent reference to an Asset. The lightbox is scoped to the entered Collection.

## Formal persistence questions for a later decision

1. **Minimum fields.** A future Collection needs a stable Collection ID, Site ID, title, optional introduction, visibility/order, ordered Asset ID references, gallery style, and independent cover Asset ID plus cover fit/focal position. Asset bytes and paths do not belong in these fields.
2. **Ownership/location.** Collections would be Site-owned domain data participating in the eventual Draft/Revision/Publish lifecycle, not template-local state. This proof does not choose a database table or serialized shape.
3. **Legacy compatibility.** Current nine slots and all eleven template IDs continue to render as before unless the local proof is explicitly enabled. A future adapter must not silently reinterpret the nine slots as the photographer's real categories.
4. **Frozen document.** `SiteDocumentV1` is unchanged. The collection shape requires a later versioned product/architecture decision; this PR adds no field, variant ID, migration, or save API.
5. **References and reuse.** Collection membership and the cover reference point to stable Asset IDs. One Asset may belong to multiple Collections without copying files. Order belongs to each Collection, not the Asset.
6. **Delete/missing behavior.** A future Admin flow must show references before removing an Asset or Collection. Hidden Collections disappear from public navigation; missing/removed assets must be skipped safely, and a missing cover falls back to the first available member or an empty state. The proof demonstrates only this fail-safe display behavior.
7. **Cover versus body.** Cover fit/focal position is Collection presentation state. Gallery and lightbox use the natural source ratio and full image. Future Admin should edit cover and membership separately with a clear preview; this local panel is not that Admin design.
8. **Hosted IDs.** The hosted Asset resolver should keep the existing stable Asset ID contract. Collections reference IDs, never local `/photos/` URLs, import positions, filenames, or hashes as the official persisted shape.
9. **Adapter/migration cost.** Adopting Collections will require an explicit versioned adapter, public and Admin rendering, revision validation, reference-aware deletion, and a human-approved migration choice for legacy slots (for example an unnamed/“旧作品” collection). No automatic classification or migration is authorized here.

The next gate is human review of the collection-cover scene, two gallery styles, lightbox and local configuration ergonomics. Approval of this design proof does not authorize implementing persistence or deploying it.
