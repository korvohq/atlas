# PRD: Atlas Verifiable Research Protocol v2 and Medha Publishing Bridge

- **Status:** In implementation — Phase 0 foundations
- **Date:** 2026-07-14
- **Target:** Atlas `0.4.x` foundations, followed by a gated `0.5.x` public workflow
- **Owners:** Atlas, Korvo, and Medha teams
- **Scope:** Hosted Atlas protocol, persistence, API, publication, and validation
- **Out of scope:** Korvo private storage, Atlas Local internals, model-provider calls, and automatic local-to-global synchronization

This document is the implementation source of truth for evolving the existing
Atlas `0.3.0` prototype into a safe hosted destination for reviewed research
produced by Korvo and analyzed by Medha.

## 0. Implementation review update — 2026-07-15

The Korvo/Medha boundary and phased plan are technically coherent. In
particular, treating local-to-global movement as an explicit publication with
reviewed public bytes is the correct privacy and trust boundary. Implementation
started with the release-blocking foundations rather than v2 tables or a real
chain adapter.

Verified first slice:

- `createApp(dependencies)` is side-effect free and `startServer()` owns schema
  initialization and listening;
- SQLite, storage, attestation, clock, and ID generation are injectable;
- tests use in-memory SQLite and fake storage/attestation adapters;
- `npm test` runs type checking plus real Vitest/Supertest assertions;
- RFC 8785 JCS is exposed behind `rfc8785-jcs-v1`, using the pinned
  CommonJS-compatible `canonicalize@2.1.0` package;
- publication hashes and uploads the same canonical UTF-8 representation;
- golden fixtures cover recursive key order, nested mutation, Unicode,
  escaping, supported numeric boundaries, and array-order significance;
- new bundles carry `canonicalizationVersion`; unmarked bundles fail closed as
  `legacy_top_level_only` rather than being reported as full-content verified.

Repository-local v1 inventory found one artifact row, zero `chain_records`, zero
artifact `txHash` values, and one orphaned local-storage/local-ledger simulation
entry. The orphan matches the defective top-level-only algorithm and does not
match RFC 8785. It is development-only repository state and was not deleted.
Whether any separately deployed/public v1 records exist still requires an
operator inventory before AV2-005 can be closed.

Implementation clarifications accepted during review:

1. A preview's server-generated IDs, authenticated actor, canonical bytes, and
   hash form one immutable receipt. Commit must reference that receipt; it must
   not rebuild authoritative bytes from mutable client or database state.
2. `charStart`/`charEnd` and UTF-8 byte offsets are different locator types and
   must not share ambiguous fields. The v2 schema must name byte offsets
   explicitly when byte alignment is required.
3. End-to-end exactly-once network effects cannot be guaranteed by SQLite
   alone. Storage and attestation steps need provider idempotency keys,
   content-addressing, or receipt reconciliation after a crash.
4. The idempotency key is scoped to authenticated actor plus operation and is
   bound to a request fingerprint. Reuse with different input must return a
   conflict, not replay the first result.
5. `permanenceAcknowledged` must be true before any commit to a persistence mode
   whose deletion cannot be guaranteed; `false` is valid only at draft/preview
   time and must produce a blocker when permanence applies.

## 1. Executive decision

Atlas Global will accept **explicit, reviewed, public research bundles**. It
will not ingest raw Medha runs, private Korvo context, prompts, candidate model
responses, personal memory, or local scope identifiers.

The product boundary is:

```text
Korvo private workspace
  -> provider calls
  -> Medha analysis and exact evidence validation
  -> Atlas Local private ephemeral record/draft
  -> user review, source-rights check, and redaction
  -> atlas.publish.v2 preview
  -> user confirms the exact preview hash
  -> idempotent Atlas Global publication
  -> public validation, challenge, revision, and attestation
```

Local-to-global movement is **publishing**, not synchronization. Nothing leaves
Korvo merely because Atlas Local exists or a Medha analysis completes.

Before implementing this bridge, Atlas must repair its publication integrity and
establish automated tests. The current nested bundle hash is not safe for public
integrity claims.

## 2. Verified current stage

Audit performed against the repository on 2026-07-14.

### 2.1 Implemented and compiling

| Capability | Verified implementation |
| --- | --- |
| Runtime | Node.js, TypeScript, Express 5 |
| Persistence | SQLite through `better-sqlite3`, WAL and foreign keys enabled |
| Public objects | Questions, sources, claims, artifacts, validators, challenges, endorsements, artifact revisions, and chain records |
| Relationships | Claim-source and artifact-claim/source junction tables, while legacy JSON ID arrays remain |
| Search | SQLite FTS5 for questions, sources, claims, and artifacts |
| Validation | Draft-07 JSON Schemas compiled with AJV on create/update routes |
| Authentication | Public reads and API-key-protected writes; admin role on key management |
| Publication storage | Local storage adapter by default; optional Kubo/IPFS adapter |
| Attestation | `LocalChainAdapter` JSON ledger simulation |
| Publication API | Build bundle, hash, store, locally anchor, record, retrieve, and verify |
| Review signals | Claim review endpoint, challenges, endorsements, validator records |
| Build | `npm run build` passes |

### 2.2 Not implemented or not production-ready

| Gap | Verified evidence/impact |
| --- | --- |
| Automated tests | `npm test` prints `Tests coming soon` and exits successfully; there are zero test assertions |
| CI | No build/test/security workflow exists |
| Real blockchain adapter | `getChainAdapter()` always returns `LocalChainAdapter`; `ATLAS_CHAIN_NETWORK` is not used |
| Entity object | README names Entity, but no schema, table, route, or relationship exists |
| Source versions/evidence spans | Claims link to whole sources; exact immutable evidence locators do not exist |
| Versioned migrations | `initDb()` uses `CREATE TABLE IF NOT EXISTS`; it cannot reliably evolve existing tables |
| Immutable public revisions | Mutable artifact rows hold the latest chain fields; a published artifact cannot be published again |
| Idempotent publication | No idempotency key, publication job, outbox, or resumable state exists |
| Transaction safety | Artifact/claim writes and relation syncs are separate operations; challenge and validation count updates are separate operations |
| API-key storage | Raw keys are stored and queried as plaintext |
| Identity binding | Request keys are not bound to validator/reviewer IDs; clients can submit another validator ID |
| OpenAPI accuracy | Spec version is `0.2.0`, paths use legacy `/api/*`, and some response shapes differ from `0.3.0` routes |
| Confidence semantics | Claim confidence includes `verified`, conflating belief, review, and evidence support |
| Licensing decision | Standard open-data grants are combined with an extra AI-training restriction; specialist legal review is required |

### 2.3 Release-blocking integrity defect

`src/chain/hash.ts` currently canonicalizes with:

```text
JSON.stringify(bundle, Object.keys(bundle).sort())
```

A replacer array applies at nested levels too. Because it contains only top-level
keys, nested artifact, claim, and source fields are omitted. The audit verified
that bundles with different titles, bodies, and opposite claims serialize to the
same nested-empty representation and receive the same SHA-256 hash.

Consequences:

- current hashes do not prove integrity of the nested research content;
- “tamper-proof,” “independently verifiable,” or equivalent claims are unsafe;
- existing v1 publication records cannot be silently upgraded to full-content
  integrity;
- publication must remain development-only until canonicalization tests pass.

### 2.4 Other verified publication defects

- `buildBundle()` rejects any artifact with an existing `txHash`, so the later
  `previousVersionTx` logic cannot create a new published revision.
- Credits are deducted before storage/attestation and are not restored on
  failure.
- `publishedBy` can be supplied by the request body instead of being derived
  from the authenticated identity.
- Artifact PATCH stores a revision snapshot before validating the update.
- Published artifact rows remain mutable even though their stored bundle is
  described as immutable.
- Publication performs network and database steps without an idempotent job or
  recoverable state machine.

## 3. Problem statement

Atlas currently proves that a prototype API and object model are feasible, but
it cannot yet provide strong research-verification guarantees.

The hosted service needs to answer five different questions without conflating
them:

1. **Integrity:** Are these exactly the bytes that were published?
2. **Provenance:** Who or what produced, reviewed, and published them?
3. **Evidence:** Which exact source version and passage supports or contradicts
   each claim?
4. **Validation:** Who challenged, endorsed, or resolved the claim, and under
   what authority?
5. **Epistemic status:** Given the evidence and unresolved disputes, what can a
   consumer safely infer?

Hashes answer only the first question. Signatures/attestations answer part of the
second. Neither proves that a claim is true.

## 4. Goals

### 4.1 P0 goals

1. Make bundle hashing recursively canonical and covered by golden tests.
2. Establish real automated unit, integration, migration, and API tests.
3. Introduce versioned, transactional database migrations.
4. Make publication previewable, immutable, idempotent, and recoverable.
5. Separate evidence status, review status, claim lifecycle, and confidence.
6. Add immutable source versions, exact evidence spans, and typed evidence
   relationships.
7. Define a strict `atlas.publish.v2` bundle accepted from Korvo after review.
8. Preserve clear human/agent/provider provenance without publishing private
   execution data.
9. Keep v1 APIs compatible during a documented deprecation window.
10. Make README and OpenAPI claims match deployed adapters and verified tests.

### 4.2 P1 goals

1. Add Entity and entity-claim/source relationships.
2. Make validation events append-only and identity-bound.
3. Return a transparent claim scorecard rather than one magical truth score.
4. Provide machine-readable claim/evidence graph retrieval.
5. Support new immutable publication revisions linked to prior revisions.
6. Add moderation, retraction, rights, and abuse workflows.

### 4.3 P2 goals

1. Add a production chain adapter only after protocol/hash stability.
2. Add portable author signatures and multiple storage replicas.
3. Add domain-specific reputation after enough resolved validation outcomes
   exist.

## 5. Non-goals

The first implementation must not:

- run Atlas hosted infrastructure on each Korvo device;
- accept automatic background uploads from Atlas Local;
- store raw `AnalyzeRequest`, `ContextReceipt`, candidate responses, prompts,
  private project IDs, global personal memory, provider credentials, or model
  chain-of-thought;
- present model agreement as truth;
- present IPFS availability or a blockchain record as evidence correctness;
- train a frontier model;
- create a universal reputation score before real resolution data exists;
- require a blockchain to make normal Atlas publication useful;
- upload full copyrighted source material when redistribution rights are absent
  or unknown.

## 6. Ownership boundaries

| Layer | Owns | Must not export/own |
| --- | --- | --- |
| Korvo | Private scopes, files, memory, provider calls, tools, review/redaction UI, publish confirmation | Hidden cross-project context or automatic public writes |
| Medha | Claim normalization, exact evidence alignment, relation validation, conflict analysis, synthesis/critique orchestration, confidence metadata | Canonical user storage, provider credentials, publication side effects |
| Atlas Local | Private ephemeral analysis and reviewed drafts, local scoped retrieval | Public reputation or automatic global synchronization |
| Atlas Global | Public immutable revisions, source/evidence graph, validation events, discovery, hosted API, optional storage/attestation | Private Korvo run payloads or claims that publication proves truth |

## 7. Trust vocabulary

The following dimensions must be separate fields.

### 7.1 Origin

```text
human
agent_generated
ai_assisted
imported
system
```

### 7.2 Review status

```text
unreviewed
human_accepted
human_rejected
needs_changes
```

A reviewer identity and timestamp must be persisted, not only returned in an API
response.

### 7.3 Evidence status

```text
unverified
user_asserted
source_supported
partially_supported
contradicted
disputed
not_applicable
```

### 7.4 Claim lifecycle

```text
draft
asserted
published
disputed
superseded
retracted
unresolved
```

### 7.5 Integrity and provenance

```text
integrity_status: unverified | hash_verified | unavailable
provenance_status: unsigned | authenticated | signed
attestation_status: none | local_simulation | externally_anchored
```

API consumers must be able to see cases such as:

```json
{
  "integrityStatus": "hash_verified",
  "provenanceStatus": "authenticated",
  "evidenceStatus": "disputed",
  "attestationStatus": "none"
}
```

## 8. Protocol v2 object model

All public protocol objects require `schemaVersion`, stable IDs, timestamps,
origin, actor identity, and provenance where applicable.

### 8.1 Entity

Represents a stable subject such as a company, person, technology, place, or
organization.

Required fields:

```text
id
schemaVersion
canonicalName
entityType
aliases[]
externalIdentifiers{}
createdAt
updatedAt
```

Entity resolution is initially manual or deterministic. Do not automatically
merge entities based only on model similarity.

### 8.2 Source and SourceVersion

`Source` is stable identity/metadata. `SourceVersion` is immutable retrieved
content identity.

```text
Source
  id
  type
  title
  canonicalUrl?
  publisher?
  rightsStatus
  createdAt

SourceVersion
  id
  sourceId
  retrievedAt
  publishedAt?
  contentHash?
  hashAlgorithm?
  mediaType?
  byteLength?
  storagePointer?
  availabilityStatus
  rightsStatus
  supersedesVersionId?
```

`rightsStatus` must include at least:

```text
metadata_only
quote_allowed
redistributable
restricted
unknown
```

If rights do not permit redistribution, Atlas may publish metadata, URL, hash,
and a legally permitted quote, but not the full source bytes.

### 8.3 EvidenceSpan

Evidence must point to an exact immutable source version rather than only a
source.

```text
id
sourceVersionId
locator:
  page?
  section?
  paragraph?
  charStart?
  charEnd?
  timeStartMs?
  timeEndMs?
  urlFragment?
exactQuote
quoteHash
createdBy
createdAt
```

When source bytes are available, Atlas validates the exact UTF-8 byte range and
quote. When they are unavailable, the span remains externally locatable but its
local alignment status must be explicit.

### 8.4 Claim and ClaimVersion

`Claim` is stable identity. Published wording and semantics live in immutable
versions.

```text
ClaimVersion
  id
  claimId
  version
  statement
  semantics:
    subject?
    predicate?
    object?
    conditions[]
    assumptions[]
    validAt?
    units?
  qualifiers[]
  uncertainty?
  origin
  reviewStatus
  evidenceStatus
  lifecycle
  validFrom?
  validUntil?
  observedAt?
  supersedesClaimId?
  provenance
  confidence?
  createdAt
```

Confidence is optional and structured:

```text
rawScore?
calibratedScore?
band: unknown | low | moderate | high
sampleSize
calibrationDatasetVersion?
```

Model self-reported confidence must not be stored as calibrated confidence.
`verified` must not be a confidence value.

### 8.5 ClaimEvidenceEdge

```text
id
claimVersionId
evidenceSpanId
relation: supports | contradicts | qualifies | mentions | supersedes
verificationMethod: human | semantic_provider | deterministic | imported
score?
rationale?
createdBy
createdAt
```

A claim becomes `source_supported` only when at least one valid `supports` edge
exists. `mentions` is never upgraded to support. Contradictory evidence remains
visible and affects the scorecard.

### 8.6 Artifact and ArtifactRevision

`Artifact` is stable identity. Every reviewed or published revision is immutable.

```text
ArtifactRevision
  id
  artifactId
  version
  title
  type
  body
  summary?
  questionId?
  claimVersionIds[]
  sourceVersionIds[]
  evidenceSpanIds[]
  createdBy
  reviewStatus
  createdAt
  previousRevisionId?
```

Editing creates another revision. It never mutates bytes that a publication
record references.

### 8.7 PublicationRecord

Replaces mutable chain fields as the canonical publication history.

```text
id
artifactRevisionId
bundleSchemaVersion
canonicalizationVersion
contentHash
hashAlgorithm
storageProvider
storagePointer
attestationProvider
attestationReference?
status
idempotencyKey
publishedBy
publishedAt?
previousPublicationId?
failureCode?
createdAt
updatedAt
```

A local chain simulation must report `attestationProvider: local_simulation`, not
claim a public blockchain anchor.

### 8.8 ValidationEvent

Endorsements, challenges, resolutions, retractions, and reviews are append-only
events referencing immutable claim versions.

```text
id
claimVersionId
validatorId
eventType
weight?
reason?
evidenceSpanIds[]
conflictOfInterest?
createdAt
supersedesEventId?
```

## 9. Mapping from Medha to Atlas Global

Korvo performs this mapping only after user review. Atlas validates the result
but does not accept a raw Medha run as a public object.

| Medha `medha.analysis.v1` field | Atlas v2 mapping |
| --- | --- |
| `AnalysisResult.answer` | Reviewed `ArtifactRevision.body` |
| `AnalyzedClaim.text` | `ClaimVersion.statement` |
| `AnalyzedClaim.semantics` | `ClaimVersion.semantics` |
| `qualifiers`, `uncertainty` | Same named claim-version fields |
| Candidate/provider provenance | Sanitized public provenance when disclosure is approved |
| `EvidenceLink` with validated context quote | `EvidenceSpan` plus `ClaimEvidenceEdge` after the context source is mapped to a publishable `SourceVersion` |
| `EvidenceRelation` | Same relation vocabulary |
| `EvidenceStatus` | Evidence status, never confidence |
| Calibrated `ConfidenceReport` | Structured confidence only with dataset version/sample size |
| `AnalysisConflict` | Draft warning or public challenge proposal; not automatically a validator challenge |

The following Medha fields are private by default and must not enter the public
bundle:

- `AnalyzeRequest`;
- candidate response text and candidate byte spans;
- `ContextReceipt.selected` and `.excluded`;
- private context IDs, local scopes, project IDs, or inbox IDs;
- critique/revision prompts;
- lexical agreement diagnostics;
- provider credentials;
- internal run IDs unless converted to a non-identifying public provenance ID.

`source_span` on a Medha claim points into a candidate model response; it is not a
source citation and must not become an `EvidenceSpan`.

## 10. `atlas.publish.v2` bundle

The client submits a strict public bundle proposal. Unknown fields are rejected.
Server-generated IDs and authenticated actor identity are authoritative.

Illustrative shape:

```json
{
  "schemaVersion": "atlas.publish.v2",
  "clientPublicationId": "opaque-idempotency-id",
  "question": {},
  "entities": [],
  "sources": [],
  "sourceVersions": [],
  "evidenceSpans": [],
  "claims": [],
  "claimEvidenceEdges": [],
  "artifactRevision": {},
  "consent": {
    "rightsConfirmed": true,
    "privacyReviewed": true,
    "permanenceAcknowledged": false
  }
}
```

The bundle must not have a `scope`, `allowedScopes`, `context`, `candidates`,
`prompt`, or `memory` field.

## 11. Canonicalization and integrity

### 11.1 Required algorithm

Use a standards-based recursive canonical JSON implementation, preferably RFC
8785 JSON Canonicalization Scheme (JCS), behind a versioned interface.

```text
canonical bytes = canonicalize(bundle, canonicalizationVersion)
content hash    = SHA-256(canonical bytes)
```

Do not use a top-level `JSON.stringify` replacer.

### 11.2 Golden conformance fixtures

Commit fixtures containing:

- source JSON;
- expected canonical UTF-8 bytes;
- expected SHA-256;
- nested key-order variations;
- Unicode and escaping cases;
- number boundary cases supported by the protocol;
- deliberately changed nested claims/sources that must change the hash.

The same fixtures must pass in Atlas TypeScript and, when adapters are added, in
Korvo/Dart and Substrate/Rust.

### 11.3 Existing v1 records

Never relabel an existing v1 hash as full-content integrity.

Options:

1. If no production v1 publication exists, reset development publication data
   and document the reset.
2. If public v1 records exist, retain them as
   `legacy_integrity_scope: top_level_only`, expose a warning, and publish a new
   v2 revision after review.

This decision requires an inventory before migration.

## 12. Publication API

Canonical routes use `/api/v1`. Legacy `/api` routes receive `Deprecation` and
`Sunset` headers and are removed only after a documented compatibility window.

### 12.1 Preview

```text
POST /api/v1/publication-previews
```

The server:

1. authenticates the actor;
2. validates schema, counts, sizes, references, and rights metadata;
3. rejects private-only fields;
4. verifies exact spans where source bytes are available;
5. calculates warnings and a publication scorecard;
6. creates the exact canonical bytes and content hash;
7. stores an expiring immutable preview;
8. returns `previewId`, `contentHash`, canonicalization version, included object
   summary, warnings, and blockers.

Preview performs no IPFS upload, attestation, credit charge, or public write.

### 12.2 Commit

```text
POST /api/v1/publications
Idempotency-Key: <opaque high-entropy value>

{
  "previewId": "...",
  "expectedContentHash": "sha256:..."
}
```

Commit fails if the preview expired or its hash differs. The authenticated actor,
not request body text, defines `publishedBy`.

### 12.3 Status and retry

```text
GET  /api/v1/publications/:id
POST /api/v1/publications/:id/retry
GET  /api/v1/publications/:id/bundle
GET  /api/v1/publications/:id/verify
```

Retries reuse the same publication ID and idempotency key. They must not create a
second charge, storage upload, or publication record after a successful step.

### 12.4 Publication state machine

```text
previewed
  -> queued
  -> storing
  -> stored
  -> attesting (optional)
  -> published

Any network stage -> retryable_failed | terminal_failed
```

Persist transitions and an outbox/job record transactionally. Do not hold a
SQLite transaction open across network calls.

### 12.5 Credit semantics

Credits are reserved atomically when the publication job is created and captured
exactly once on success. Retryable/terminal failure either keeps a visible
reservation or releases it according to a documented policy. A failed upload
must not silently consume a credit.

## 13. Publication preflight

A preview is blocked when:

- schema/protocol/canonicalization version is unsupported;
- object count, field length, or bundle bytes exceed configured limits;
- references are missing or duplicated;
- a `source_supported` claim lacks a valid supporting evidence edge;
- an evidence quote/locator does not match available source-version bytes;
- source bytes are included without compatible redistribution rights;
- private scope/context/memory/prompt fields are present;
- obvious secrets or high-risk personal data are detected and unacknowledged;
- agent-generated material is presented as human-authored;
- required human review or permanence consent is absent;
- the authenticated identity cannot publish for the declared contributor.

Warnings that do not necessarily block publication include unresolved
contradictions, unavailable source snapshots, low evidence coverage, and open
challenges. They remain visible in the public scorecard.

## 14. Database migration strategy

### 14.1 Migration framework

Add ordered migrations and a `schema_migrations` table. Every migration:

- has a unique version and checksum;
- runs transactionally when SQLite permits;
- is idempotently detected, not re-executed;
- has an upgrade test from a checked-in `0.3.0` fixture;
- validates row counts and foreign-key integrity;
- creates a backup/rollback instruction before destructive operations.

`CREATE TABLE IF NOT EXISTS` is not a substitute for migrations.

### 14.2 Additive first release

Add v2 tables without deleting v1 columns:

```text
entities
entity_aliases
source_versions
evidence_spans
claims_v2 or claim_versions
claim_evidence_edges
artifact_revisions_v2
publication_previews
publication_records_v2
publication_jobs
outbox_events
validation_events
schema_migrations
```

Retain v1 JSON array columns while v1 routes exist, but v2 repositories use
normalized relations as authoritative.

### 14.3 Repository transactions

Create repository/service methods that transactionally perform:

- object insert plus relationships;
- artifact revision plus claim/source/evidence links;
- challenge event plus derived claim status update;
- endorsement uniqueness plus validator counters;
- publication-job creation plus credit reservation;
- publication completion plus outbox and immutable record.

Do not leave transaction boundaries spread across route handlers.

## 15. Authentication and authorization

1. Replace plaintext API-key storage.
2. Use a key format with a public lookup prefix and high-entropy secret.
3. Store only a secure verifier (for example Argon2id) and show the secret once.
4. Compare secrets in constant time.
5. Bind contributor/validator identity to the authenticated key/account.
6. Derive publisher and reviewer identity server-side.
7. Require appropriate roles for human verification, challenge resolution,
   moderation, and publication.
8. Add key rotation and audit events.
9. Reject an invalid supplied Bearer token rather than silently treating it as
   anonymous on a public-read request.
10. Disable development seed credentials outside explicit development mode.

## 16. Validation and reputation

### 16.1 Reviews and challenges

- Review decisions are append-only events with actor and timestamp.
- Challenges target immutable claim versions and may cite evidence spans.
- Challenge resolution requires an authorized resolver and records a rationale.
- Derived claim state is recomputed from active events; changing a challenge
  cannot leave stale claim status.
- Retractions and supersession preserve history.

### 16.2 Endorsements

- Enforce `(claimVersionId, validatorId, eventType)` uniqueness in SQLite, not
  only application checks.
- Bind `validatorId` to the authenticated actor.
- Preserve conflict-of-interest disclosure.
- Do not let raw user-supplied weights become an unqualified credibility score.

### 16.3 Claim scorecard

Return explainable dimensions rather than one truth probability:

```text
evidence coverage
supporting source count
independent source count
contradicting evidence count
source freshness
human review status
validator diversity
open challenge count
integrity status
provenance status
```

Domain reputation and calibrated aggregate weighting remain P1/P2 until Atlas
has resolved outcomes and anti-Sybil controls.

## 17. Search and AI-consumer safety

1. Search v2 claim versions, source versions, entities, evidence spans, and
   artifact revisions.
2. Return object type, immutable revision ID, provenance, and evidence status.
3. Invalid FTS queries return a typed `400`; do not silently convert every
   database/search error to an empty result.
4. Paginated totals apply the same filters as result queries.
5. Imported/public text is always untrusted data.
6. API responses mark text fields as data; clients must not place them into
   system/tool instruction channels.
7. Rendered Markdown/HTML is sanitized in every consuming UI.
8. Add duplicate/spam controls without hiding challenge history.

## 18. API and schema compatibility

- `openapi.yaml` becomes canonical for `/api/v1` and reports the package version.
- Add request/response contract tests for every documented route.
- Prefer generating TypeScript types from schemas/OpenAPI or checking drift in
  CI.
- All write schemas set `additionalProperties: false` unless a versioned
  extension mechanism is explicitly designed.
- Errors use a stable envelope:

```json
{
  "error": {
    "code": "ATLAS_INVALID_EVIDENCE_SPAN",
    "message": "...",
    "field": "evidenceSpans[2].exactQuote",
    "requestId": "..."
  }
}
```

- Unknown enum values or incompatible major schema versions fail closed.
- Legacy routes receive explicit deprecation headers and are tested until
  removal.

## 19. Test strategy

### 19.1 Harness first

Adopt a maintained test runner compatible with the current TypeScript stack
(e.g. Vitest) plus HTTP integration tooling (e.g. Supertest).

Refactor server construction into:

```text
createApp(dependencies) -> Express app
startServer()            -> listener side effect
```

Tests use temporary SQLite databases and injected storage/attestation adapters.
Importing the app must not open the production database or listen on a port.

### 19.2 Required test suites

#### Canonicalization and integrity

- Nested changes always change the hash.
- Object key order never changes the hash.
- Array order follows explicitly documented semantics.
- Unicode/escaping/numeric fixtures match expected canonical bytes.
- Stored bundle, returned bundle, preview bytes, and verified bytes match.
- v1 records are never reported as v2 full-content integrity.

#### Migrations

- Fresh database reaches latest schema.
- Checked-in `0.3.0` fixture upgrades without data loss.
- Re-running migrations is a no-op.
- Failure rolls back cleanly.
- Foreign-key and row-count checks pass.

#### CRUD and relationships

- Invalid requests produce no partial rows or revisions.
- Missing relation IDs fail transactionally.
- FTS and normalized relations stay consistent after create/update/delete.
- Filtered totals equal filtered datasets.

#### Publication

- Preview performs no network write or charge.
- Commit publishes exactly the previewed hash.
- Repeated idempotency keys return one publication.
- Crash/failure injection at every stage resumes without duplicates.
- Failed upload/attestation does not silently consume an extra credit.
- A new artifact revision creates a linked new publication.
- Published revision bytes remain immutable.
- `publishedBy` cannot be spoofed by request body.

#### Medha/Korvo conformance

- Valid reviewed `atlas.publish.v2` fixture is accepted.
- Raw `AnalyzeRequest`, private scope, context receipt, candidates, prompts, and
  memory are rejected.
- Candidate `source_span` cannot masquerade as evidence.
- `Mentions` cannot make a claim `source_supported`.
- Exact quote/byte-span mismatch is rejected.
- Uncalibrated model confidence is not labeled calibrated.

#### Auth and validation

- Plaintext keys are absent from the database.
- Revoked/invalid keys fail consistently.
- Reviewer/publisher/validator identity cannot be spoofed.
- Agent keys cannot perform human-only review.
- Duplicate endorsement is prevented under concurrent requests.
- Challenge resolution recomputes derived claim state.

#### Adversarial and limits

- Oversized/deep JSON is rejected before expensive work.
- Malicious Markdown/HTML remains inert data.
- Prompt-injection text cannot invoke tools or change server policy.
- Invalid FTS syntax returns a typed error.
- Rate limits and idempotency interact predictably.
- Secrets/PII preflight fixtures produce expected blockers/warnings.

### 19.3 CI gates

Every pull request runs:

```text
npm ci
npm run build
npm test
schema/OpenAPI drift check
migration tests
canonicalization conformance tests
npm audit policy check
```

Core publication, canonicalization, migration, and authorization modules require
high branch coverage and explicit failure-path tests. Coverage percentage alone
is not a substitute for the listed invariants.

## 20. Observability and privacy

Record without logging private content:

- request ID, endpoint, status, latency, and actor ID;
- schema/canonicalization version;
- preview blocker/warning codes;
- publication state transitions, attempts, and failure codes;
- storage/attestation latency and availability;
- idempotency replays;
- verification failures;
- challenge/endorsement counts and resolution latency.

Never log API secrets, full unpublished bundles, source bytes, private Korvo IDs,
or model prompts. Define retention and deletion policies before production.

## 21. Documentation and claim policy

Until the corresponding gates pass:

- say “local attestation simulation,” not “anchored on-chain”;
- say “optional IPFS adapter,” not “all artifacts live on IPFS”;
- say “hash integrity,” not “truth verified”;
- do not claim tests exist because `npm test` exits zero;
- expose the current adapter/provider in health and publication responses;
- document v1 integrity limitations prominently;
- keep OpenAPI, package version, README, and runtime routes synchronized.

Specialist legal review must resolve the interaction between CC BY-SA/ODbL grants
and the additional AI-training/bulk-use restriction before public data launch.
This PRD does not provide legal advice.

## 22. Rollout plan

### Phase 0 — Stop unsafe claims and characterize v0.3

- Add an implementation-status warning to README.
- Mark local storage/local-chain behavior accurately.
- Add test harness and characterization tests.
- Fix recursive canonicalization and add golden fixtures.
- Inventory any existing v1 publication records.

**Exit:** nested mutations change hashes; tests fail on the old implementation;
README no longer presents simulation as production chain verification.

### Phase 1 — Production foundations

- Add app factory/dependency injection.
- Add ordered migrations and repository/service transactions.
- Harden API keys and actor identity.
- Add idempotency/outbox/publication job state.
- Bring OpenAPI to canonical `/api/v1` parity.

**Exit:** migration, failure-injection, auth, and API contract suites pass in CI.

### Phase 2 — Evidence protocol v2

- Add Entity, SourceVersion, EvidenceSpan, ClaimVersion,
  ClaimEvidenceEdge, ArtifactRevision, PublicationRecord, and ValidationEvent.
- Add strict schemas and conformance fixtures.
- Backfill v1 objects as explicitly legacy/unverified projections.
- Add v2 graph retrieval.

**Exit:** exact evidence can be inspected from a claim to immutable source version;
no legacy row is silently upgraded to stronger trust semantics.

### Phase 3 — Reviewed Korvo/Medha publication

- Implement preview/preflight.
- Implement exact-hash user confirmation and idempotent commit.
- Add Korvo mapping fixtures and adapter.
- Add rights/privacy/permanence confirmation.
- Release behind feature flags to internal users.

**Exit:** no private field reaches Atlas; preview bytes equal publication bytes;
retries and crashes produce one publication and one charge.

### Phase 4 — Public validation

- Make reviews/challenges/endorsements append-only and identity-bound.
- Add transparent claim scorecards.
- Add moderation, retraction, appeals, and abuse controls.
- Seed one focused research domain with invited reviewers.

**Exit:** resolved challenge workflows and anti-spoofing tests pass; scorecards are
explainable and do not claim truth probability.

### Phase 5 — Portable storage and attestation

- Add monitored IPFS pinning/replication.
- Add author signatures.
- Consider one real chain adapter only after threat/legal/operational review.
- Keep non-chain publication fully supported.

**Exit:** independent retrieval and verification pass outage tests; adapter names
and guarantees are accurately exposed.

## 23. Execution tracker

Status vocabulary:

```text
TODO     accepted, not started
DOING    active implementation
BLOCKED  waiting on named dependency/decision
VERIFY   reported but not yet covered by automated evidence
DONE     implemented and covered by acceptance evidence
DEFERRED intentionally outside the current release
```

| ID | Owner | Priority | Status | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| AV2-001 | Atlas | P0 | DONE | — | Repository audit dated 2026-07-14 records actual code, build, and zero-test baseline |
| AV2-002 | Atlas | P0 | DONE | AV2-001 | Side-effect-free app factory, explicit server start, injected DB/adapters/clock/IDs, in-memory SQLite, and Vitest/Supertest assertions pass |
| AV2-003 | Atlas | P0 | DOING | AV2-002 | Health, auth boundary, question canonical/legacy parity, publication, bundle, and verification are characterized; remaining v1 routes still need coverage |
| AV2-004 | Atlas | P0 | DONE | AV2-002 | Pinned RFC 8785 canonicalizer passes committed byte/hash fixtures, recursive key-order tests, and nested-mutation regression |
| AV2-005 | Atlas | P0 | BLOCKED | AV2-004, deployed-record inventory | Local orphan is classified/tested as `legacy_top_level_only`; confirmation or inventory of any separately deployed/public v1 records is still required |
| AV2-006 | Atlas | P0 | TODO | AV2-002 | Ordered transactional migration framework upgrades fresh and checked-in `0.3.0` databases idempotently |
| AV2-007 | Atlas | P0 | TODO | AV2-006 | Repository/service transactions prevent partial objects, relations, revisions, challenges, and counters |
| AV2-008 | Atlas | P0 | TODO | AV2-006, AV2-007 | Publication job/outbox has persisted state, retries, idempotency, and exactly-once successful record creation |
| AV2-009 | Atlas | P0 | TODO | AV2-008 | Credit reservation/capture/release behavior is transactional and failure-tested |
| AV2-010 | Atlas | P0 | TODO | AV2-002, AV2-006 | API secrets are not stored plaintext; rotation, revocation, constant-time verification, and dev-only seed policy are tested |
| AV2-011 | Atlas | P0 | TODO | AV2-010 | Publisher/reviewer/validator identity is server-derived and role-bound; spoof tests pass |
| AV2-012 | Atlas | P0 | TODO | AV2-003 | OpenAPI describes canonical `/api/v1`, package version, real response envelopes, errors, and deprecation policy; drift check runs in CI |
| AV2-013 | Atlas | P0 | DONE | AV2-001 | README audited 2026-07-14 distinguishes local simulation, optional IPFS, current hash limitation, integrity, evidence, and truth |
| AV2-014 | Atlas | P1 | TODO | AV2-006 | Entity schema/table/repository/API and non-automatic alias resolution tests |
| AV2-015 | Atlas | P0 | TODO | AV2-006 | SourceVersion and rights/availability model supports immutable content identity without requiring source redistribution |
| AV2-016 | Atlas | P0 | TODO | AV2-015 | EvidenceSpan validates exact quotes/UTF-8 byte locators when source bytes exist and reports unavailable alignment honestly |
| AV2-017 | Atlas | P0 | TODO | AV2-016 | ClaimVersion separates lifecycle, review, evidence, provenance, temporal validity, and calibrated confidence |
| AV2-018 | Atlas | P0 | TODO | AV2-016, AV2-017 | ClaimEvidenceEdge supports typed relations; `mentions` never upgrades evidence status |
| AV2-019 | Atlas | P0 | TODO | AV2-017, AV2-018 | Immutable ArtifactRevision and PublicationRecord replace mutable chain fields as publication authority |
| AV2-020 | Cross-repo | P0 | TODO | AV2-015..AV2-019 | Versioned JSON Schemas and golden conformance fixtures pass in Atlas and are consumable by Korvo/Medha adapters |
| AV2-021 | Atlas | P0 | TODO | AV2-004, AV2-019, AV2-020 | Preview API returns exact canonical bytes/hash, included-object receipt, warnings, blockers, and expiry without side effects |
| AV2-022 | Atlas | P0 | TODO | AV2-010, AV2-011, AV2-021 | Preflight enforces references, evidence, rights, privacy fields, origin disclosure, review, limits, and consent |
| AV2-023 | Atlas | P0 | TODO | AV2-008, AV2-009, AV2-021 | Commit API requires preview ID, expected hash, and idempotency key; preview and published bytes are identical |
| AV2-024 | Korvo + Medha | P0 | BLOCKED | AV2-020, AV2-021 | Korvo maps reviewed Medha results to `atlas.publish.v2`; private-field rejection and exact-evidence fixtures pass |
| AV2-025 | Atlas | P1 | TODO | AV2-017..AV2-019 | Graph API retrieves immutable claims, source versions, evidence spans, entities, provenance, and scorecard dimensions |
| AV2-026 | Atlas | P1 | TODO | AV2-011, AV2-017 | Review and challenge actions become append-only ValidationEvents with authorized resolution and derived-state recomputation |
| AV2-027 | Atlas | P1 | TODO | AV2-011, AV2-017 | Endorsement uniqueness is database-enforced and actor-bound; concurrent duplicate test passes |
| AV2-028 | Atlas | P1 | BLOCKED | AV2-026, AV2-027, resolved outcomes | Explainable domain scorecard ships without a universal truth/reputation probability |
| AV2-029 | Atlas | P0 | TODO | AV2-015..AV2-019 | FTS/search handles v2 revisions, filtered totals, typed invalid-query errors, limits, and provenance/evidence metadata |
| AV2-030 | Cross-repo | P0 | TODO | AV2-020..AV2-024 | Threat model and adversarial suite cover injection, poisoning, PII/secrets, rights, spoofing, Sybil behavior, and permanence |
| AV2-031 | Atlas | P0 | TODO | AV2-002 | CI runs install, build, tests, schema/OpenAPI drift, migration, canonicalization, and dependency policy checks |
| AV2-032 | Atlas | P1 | TODO | AV2-008, AV2-021 | Content-safe metrics and audit events cover previews, publication states, retries, verification, and validation outcomes |
| AV2-033 | Legal + Product | P0 | BLOCKED | — | Counsel-approved data/source licensing and AI-use policy has no contradictory standard-license representation |
| AV2-034 | Atlas | P1 | BLOCKED | AV2-015, AV2-022, AV2-033 | Copyright, retraction, privacy, moderation, and appeals policy is implemented before open public contribution |
| AV2-035 | Atlas | P2 | DEFERRED | AV2-004, AV2-008, AV2-019, AV2-030, AV2-033 | Real chain adapter has explicit operational/legal case, key management, confirmation/reorg handling, and integration tests |
| AV2-036 | Atlas | P1 | BLOCKED | AV2-021..AV2-034 | Controlled one-domain launch passes all P0 gates with rollback, monitoring, and support runbooks |

## 24. Launch gates

Atlas v2 must not be presented as a production credibility layer until:

1. The nested canonical-hash regression and conformance suites pass.
2. Every canonical write/publish endpoint has success and failure-path tests.
3. Migration from a real `0.3.0` fixture passes without data loss.
4. Publication is idempotent across retries and injected crashes.
5. Preview bytes exactly equal stored/published bytes.
6. No private Medha/Korvo field is accepted by the public schema.
7. Exact evidence relationships are inspectable and distinguish support from
   mention/contradiction.
8. Publisher, reviewer, and validator identities cannot be spoofed.
9. API secrets are not stored plaintext.
10. OpenAPI and README match runtime behavior and adapter guarantees.
11. Rights, privacy, moderation, and licensing decisions are approved.
12. Residual risks, deletion limits, IPFS persistence limits, rollback, and
    incident response are documented.

## 25. Success metrics

Initial metrics are product/quality signals, not claims of truth:

- percentage of published important claims with exact supporting evidence;
- evidence-span alignment failure rate;
- unsupported/contradicted claim rate at preview;
- preview-to-publish conversion;
- publications requiring retry;
- duplicate publication prevention rate;
- verification success and storage availability;
- challenge resolution time;
- reviewer agreement/disagreement by domain;
- retraction/supersession rate;
- schema rejection and private-field blocker counts;
- API latency and error rate by endpoint.

Thresholds should be preregistered after representative internal data exists.
Do not tune metrics against a tiny seed corpus and call the result calibrated.

## 26. Open decisions

1. Are any separately deployed v1 publication records public? Repository-local
   state contains no DB publication record and one orphaned legacy local
   simulation entry, which can be reset after owner confirmation.
2. **Resolved for the CommonJS foundation:** pinned `canonicalize@2.1.0`, wrapped
   by Atlas version `rfc8785-jcs-v1`; replacement requires the same golden corpus
   and an explicit canonicalization-version decision.
3. Does Atlas store permissible source snapshots, or only hashes/metadata/quotes
   for the initial domain?
4. Which identities may perform `human_accepted` review?
5. What is the first narrow research domain and editorial policy?
6. Which fields of provider/model provenance are publicly disclosed by default?
7. What retention/deletion guarantees apply before and after IPFS publication?
8. Should non-chain publication be the default long-term path?
9. How will contributor identity and validator identity map to future user
   accounts rather than API keys?
10. What data license can accurately express the intended AI-use policy?

## 27. Immediate next five tasks

1. Complete `AV2-003`: characterize every existing v1 route and failure shape.
2. Implement `AV2-006`: ordered migrations plus a checked-in `0.3.0` upgrade
   fixture and rollback tests.
3. Implement `AV2-007`: move multi-row writes into transactional repositories.
4. Implement `AV2-010` and `AV2-011`: hashed API secrets and actor-bound
   publisher/reviewer/validator identity.
5. Implement `AV2-012` and `AV2-031`: OpenAPI parity and CI gates for build,
   tests, migrations, canonicalization, drift, and dependency policy.

Do not begin a real-chain adapter or public reputation algorithm before these
foundations are complete.

