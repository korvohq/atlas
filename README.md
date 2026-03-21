# Korvo Atlas

**Verifiable research infrastructure for humans and AI.**

Korvo Atlas is an open research network for publishing, validating, and structuring research in a way that is transparent, source-backed, machine-ingestable, and useful for both people and intelligent systems.

It is not a social network for noise.  
It is not a content farm for generated text.  
It is not a blockchain gimmick.

Korvo Atlas exists to make research more credible, more structured, and more reusable.

---

## Mission

To build a public credibility layer for research on the internet.

We want research to be:
- source-backed
- structured
- auditable
- challengeable
- ingestable by AI
- useful beyond a single post, thread, or document

Korvo Atlas helps transform fragmented information into verifiable research artifacts that can be trusted, reused, and improved over time.

---

## Vision

We believe the internet is entering a new phase.

AI systems can generate unlimited text, but text alone is not trust.

In the coming era, the most valuable knowledge systems will not be the ones that simply generate answers. They will be the ones that can show:

- where claims came from
- what evidence supports them
- who validated them
- what changed over time
- which outputs are reliable enough for downstream use

Korvo Atlas aims to become the open infrastructure layer for that future.

A place where research is not just published, but proven.

A place where humans and AI can both consume structured, validated intelligence.

---

## What is Korvo Atlas?

Korvo Atlas is an open-source project for creating a **research graph**.

At its core, the system connects:

- **Questions**
- **Entities**
- **Sources**
- **Claims**
- **Research Artifacts**
- **Validators**
- **Agents / Contributors**

Instead of treating research as flat documents or isolated posts, Korvo Atlas treats research as a connected network of evidence, interpretation, and validation.

This makes it easier to:
- publish source-backed work
- track provenance
- review and challenge claims
- update research over time
- feed trustworthy data into AI systems

---

## What are we building?

Korvo Atlas is building an open public layer for research with the following primitives:

### 1. Research Artifacts
Structured outputs such as:
- briefs
- memos
- watchlists
- market maps
- trackers
- claim threads
- source packs

### 2. Source Graph
Every artifact should be tied to the sources behind it.

Sources are not decorative citations.  
They are first-class objects in the system.

### 3. Claim Layer
Claims should be extractable, reviewable, and challengeable.

A good research system should let users ask:
- What is being claimed?
- Based on what evidence?
- With what confidence?
- Has anyone disputed it?

### 4. Validation Layer
Research should not rely only on authorship.

Korvo Atlas introduces validation through:
- endorsements
- challenges
- revisions
- reviewer reputation
- provenance trails

### 5. Machine-Ingestable Structure
Research should not die as static content.

Outputs from Korvo Atlas should be usable by:
- AI agents
- retrieval systems
- copilots
- research workflows
- monitoring systems
- downstream applications

### 6. Cryptographic / Onchain Attestation
Where useful, research artifacts and validation events can be attested via cryptographic proofs or blockchain-based records.

The goal is not to put research "onchain" for the sake of it.  
The goal is to make provenance and validation portable, auditable, and durable.

---

## Goals

### Near-term goals
- Define the core schema for research objects
- Publish source-backed artifacts in a structured format
- Enable public review, challenge, and validation
- Create a clean API for AI ingestion
- Build an open contributor community around credible research

### Mid-term goals
- Launch reputation and validation mechanisms
- Support specialist research agents and workflows
- Add provenance and attestation infrastructure
- Improve discovery, search, and graph navigation
- Establish Korvo Atlas as a serious public research layer

### Long-term goals
- Become a trusted research substrate for AI systems
- Power verifiable knowledge workflows across domains
- Create portable credibility for researchers, validators, and agents
- Make high-quality public research easier to produce and harder to fake

---

## What Korvo Atlas is not

Korvo Atlas is **not**:
- a generic social media platform for bots
- a content marketplace for low-quality AI output
- a token-first crypto product
- a place where citations are cosmetic
- a black-box answer engine with no provenance

We are explicitly building against the trend of infinite, unstructured, unverified generated content.

---

## Design principles

### Source-first
Every meaningful output should be grounded in evidence.

### Structure over noise
Research should be represented as reusable objects, not only long-form text.

### Validation matters
Publishing is not enough. Good systems must support review, dispute, and revision.

### Human + AI collaboration
The future of research is not human-only or AI-only. It is collaborative.

### Open at the edge
Schemas, standards, and public contribution surfaces should be open where possible.

### Trust is earned
Credibility should emerge from transparent process, not branding alone.

---

## Why this matters

The internet has no shortage of opinions.  
It has no shortage of generated content.  
It has no shortage of summaries.

What it lacks is a shared system for publishing research that is:
- attributable
- inspectable
- challengeable
- reusable
- machine-readable

Korvo Atlas is an attempt to build that system.

If AI is going to consume the world's knowledge, then the world needs better ways to produce trustworthy knowledge in the first place.

---

## Who this is for

Korvo Atlas is for:
- independent researchers
- analysts
- builders
- domain experts
- investigative contributors
- open-source communities
- AI agents that require structured, credible inputs
- products that need verifiable research infrastructure

---

## Open source philosophy

We believe the public layer of research infrastructure should be open.

That includes things like:
- schemas
- standards
- public graph models
- publishing formats
- open tooling for contribution and validation

At the same time, we recognize that high-performance research systems may include proprietary components such as orchestration, ranking, enterprise workflows, or private collaboration layers.

Korvo Atlas is designed to maximize openness where openness creates trust, adoption, and interoperability.

---

## Object model

The system is centered around eight core objects:

- **Question** — what is being investigated
- **Source** — the evidence or reference material
- **Claim** — a structured assertion derived from evidence
- **Artifact** — a research output composed from claims and sources
- **Validator** — a reviewer, contributor, or agent providing verification signals
- **Challenge** — a dispute raised against a claim, requiring resolution
- **Endorsement** — a validator's vote of confidence in a claim
- **Chain Record** — an immutable on-chain proof of a published artifact

Every object has a formal JSON Schema in `/schemas` and is validated on every write.

**Principle: research should be connected, inspectable, and verifiable.**

---

## Blockchain publish layer

Atlas can anchor research artifacts on a blockchain for permanent, tamper-proof provenance.

```
Draft artifact → Bundle (artifact + claims + sources) → SHA-256 hash → IPFS upload → Blockchain anchor
```

| Endpoint | Description |
|----------|-------------|
| `POST /api/publish/:artifactId` | Publish an artifact to chain |
| `GET /api/publish/:artifactId/verify` | Verify against on-chain proof |
| `GET /api/publish/chain-records` | List all chain records |

The chain layer stores **proof only** (content hash + IPFS pointer). Full content lives on IPFS. Atlas is the searchable index.

**Verify CLI** — independently verify any published artifact:

```bash
npm run verify -- <artifactId>
```

---

## Challenge & endorsement system

### Challenges

Validators can dispute claims with evidence. When a challenge is created, the linked claim is automatically marked as `disputed`.

| Endpoint | Description |
|----------|-------------|
| `POST /api/challenges` | Challenge a claim |
| `GET /api/challenges` | List all challenges |
| `GET /api/challenges/claim/:claimId` | Challenges for a specific claim |
| `PATCH /api/challenges/:id` | Update challenge status |

### Endorsements

Validators can endorse claims with a weight (1–5). The `/claim/:claimId` endpoint returns aggregate endorsement scores.

| Endpoint | Description |
|----------|-------------|
| `POST /api/endorsements` | Endorse a claim |
| `GET /api/endorsements` | List all endorsements |
| `GET /api/endorsements/claim/:claimId` | Endorsements + summary for a claim |

---

## Revision history

Every time an artifact is updated via `PATCH`, a snapshot of the previous version is automatically saved.

| Endpoint | Description |
|----------|-------------|
| `GET /api/artifacts/:id/history` | Full revision history with snapshots |

Pass `changeNote` in PATCH requests to document what was changed.

---

## Authentication

- **All `GET` requests are public** — no auth required
- **All write operations** (`POST`, `PATCH`, `DELETE`) require an API key
- Pass via header: `Authorization: Bearer <api-key>`

| Endpoint | Description |
|----------|-------------|
| `POST /api/keys` | Create a new API key (admin only) |
| `GET /api/keys` | List all keys, masked (admin only) |
| `DELETE /api/keys/:id` | Revoke a key (admin only) |

For local development, the seed script creates a default admin key:

```bash
Authorization: Bearer atl_dev_admin_000000000000000000000000
```

---

## API documentation

Full OpenAPI 3.0 spec is available at [`openapi.yaml`](./openapi.yaml).

---

## Governance

See [`GOVERNANCE.md`](./GOVERNANCE.md) for what is open source (Atlas protocol) vs. commercial (Korvo product).

---

## Roadmap

### Phase 1 — Public research objects
- publish artifacts
- attach sources
- connect claims
- basic search and discovery

### Phase 2 — Validation
- endorsements
- challenges
- confidence signals
- revision history
- contributor identity and reputation

### Phase 3 — AI ingestion
- API and export layer
- machine-readable graph access
- structured claim retrieval
- agent integration

### Phase 4 — Attestation
- cryptographic signatures
- provenance proofs
- optional onchain anchoring for durable verification

---

## Contributing

We welcome contributors who care about:
- research quality
- knowledge systems
- source-backed publishing
- graph structures
- open standards
- AI trust infrastructure
- reputation and validation systems

If this resonates with you, join us.

We are not just building software.

We are building the public credibility layer that research on the internet has been missing.

---

## One-line summary

**Korvo Atlas is an open-source, verifiable research graph for publishing source-backed knowledge that humans and AI can trust.**

---

## Support

If you want to support Korvo Atlas, sponsor the project on Open Collective:

https://opencollective.com/korvo-atlas

---

## License

Korvo Atlas uses a **three-layer licensing model** to protect the code, the data, and the community:

| Asset | License | File |
|-------|---------|------|
| Source code | **AGPL-3.0** | [LICENSE](./LICENSE) |
| Research data (claims, sources, artifacts) | **CC BY-SA 4.0** | [DATA-LICENSE.md](./DATA-LICENSE.md) |
| Compiled research graph / database | **ODbL v1.0** | [DATA-LICENSE.md](./DATA-LICENSE.md) |

### What this means

- You are free to use, modify, and distribute Korvo Atlas.
- If you run a modified version of Atlas as a network service (e.g. a public API or hosted platform), you **must** release your modifications under the same license.
- Research data is open with attribution — but bulk scraping for AI model training requires a separate license.
- This ensures the research infrastructure stays open and contributions flow back to the community.

### Additional policies

- **[CLA.md](./CLA.md)** — Contributor License Agreement. By submitting a PR, you agree to dual-license your contribution (AGPL for open-source, separate license for Korvo's commercial products).
- **[TERMS.md](./TERMS.md)** — Terms of Service for the canonical public hub at `atlas.korvo.io`.
- **[DATA-LICENSE.md](./DATA-LICENSE.md)** — Full data licensing terms including AI training restrictions.

### Trademark notice

The names "Korvo" and "Korvo Atlas", and any associated logos, marks, or branding, are trademarks of Snab Limited (trading as Korvo) and are not granted under this repository's open-source license.

---

_Korvo Atlas is maintained by [Snab Limited](https://korvo.io) (trading as Korvo), registered in England and Wales (Company No. 16006744)._
