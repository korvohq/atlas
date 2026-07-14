# Korvo Atlas — Ecosystem Architecture

> How the Atlas open-source ecosystem is structured across multiple projects.

---

## Overview

Atlas is split into **three independent repositories** that communicate through a shared schema contract and the Atlas REST API.

```
┌─────────────────────────────────────────────────────────┐
│                   atlas-schemas                         │
│          (JSON Schema + generated types)                │
│            npm: @korvo/atlas-schemas                    │
└──────────┬──────────────────────────┬───────────────────┘
           │ npm install              │ git submodule /
           │                          │ HTTP fetch
           ▼                          ▼
┌────────────────────┐    ┌───────────────────────────────┐
│      atlas         │    │        atlas-ingest           │
│  (API Server)      │◄───│  (AI Ingestion Pipeline)      │
│  TypeScript/Express│    │  Python / LLM-powered         │
│  SQLite + IPFS     │    │  Fetchers + Extractors        │
│  Blockchain anchor │    │  Pushes via REST API          │
└────────────────────┘    └───────────────────────────────┘
         ▲
         │  REST API (Bearer auth, role: 'agent')
         │
    ┌────┴────┐
    │ Clients │  (web UI, CLI, third-party agents)
    └─────────┘
```

---

## Repository Structure

### 1. `atlas` (this repo)

The core API server. Owns the database, routes, validation, IPFS publishing, and blockchain anchoring.

- **Language:** TypeScript (Node.js / Express)
- **Database:** SQLite via `better-sqlite3` (WAL mode, FTS5)
- **Storage:** Pluggable — local or IPFS via `StorageAdapter`
- **Chain:** Pluggable — local or L2s via `ChainAdapter`
- **Auth:** API key with roles (`admin`, `contributor`, `agent`)
- **Schema validation:** AJV against JSON Schemas from `schemas/`

**Key endpoints for ingestion:**
```
POST /api/v1/sources        — Create a source (paper, dataset, etc.)
POST /api/v1/claims         — Create a claim with sourceIds, origin, extractionMeta
POST /api/v1/artifacts      — Create an artifact linking claims + sources
PATCH /api/v1/claims/:id/review  — Human triage: verify or reject AI extractions
GET  /api/v1/claims?origin=ai_extracted&reviewStatus=unreviewed  — Triage queue
```

---

### 2. `atlas-schemas` (shared contract)

A lightweight package that owns the canonical JSON Schema definitions and generates TypeScript + Python types from them.

```
atlas-schemas/
├── package.json              # @korvo/atlas-schemas
├── schemas/
│   ├── question.json
│   ├── source.json
│   ├── claim.json
│   ├── artifact.json
│   ├── validator.json
│   ├── challenge.json
│   ├── endorsement.json
│   ├── revision.json
│   └── chain-record.json
├── typescript/
│   └── index.ts              # Generated TS types (json-schema-to-typescript)
├── python/
│   └── atlas_schemas/        # Generated Pydantic models (datamodel-code-generator)
│       ├── __init__.py
│       ├── claim.py
│       ├── source.py
│       └── artifact.py
└── scripts/
    ├── generate-ts.sh
    └── generate-py.sh
```

**Why a separate repo?**
- `atlas` is TypeScript, `atlas-ingest` is Python — a JS monorepo tool (Turborepo/Nx) adds friction for Python
- Schema changes are versioned independently and release-gated
- Both consumers pin to a schema version, preventing silent contract drift

**Distribution:**
- Published to npm as `@korvo/atlas-schemas`
- Python types distributed via the repo's `python/` directory (pip-installable or vendored)
- Raw JSON schemas always available at `schemas/*.json`

---

### 3. `atlas-ingest` (AI Ingestion Pipeline)

A Python application that fetches open-access research, uses LLMs to decompose papers into the Atlas object model, and pushes structured objects into Atlas via the REST API.

```
atlas-ingest/
├── pyproject.toml            # Python 3.11+, managed with uv/poetry
├── .env.example
├── Dockerfile
├── README.md
├── src/
│   └── atlas_ingest/
│       ├── __init__.py
│       ├── cli.py            # CLI entrypoint (typer)
│       ├── config.py         # pydantic-settings (env-driven)
│       ├── pipeline.py       # Orchestrator: fetch → extract → validate → push
│       ├── provenance.py     # Stamps origin, extractionMeta, reviewStatus
│       ├── atlas_client.py   # Typed HTTP client for Atlas REST API
│       ├── models.py         # Pydantic models (mirroring atlas-schemas)
│       ├── fetchers/
│       │   ├── __init__.py
│       │   ├── arxiv.py      # arXiv API client
│       │   ├── biorxiv.py    # bioRxiv API client
│       │   ├── pubmed.py     # PubMed / PMC OA client
│       │   └── semantic_scholar.py
│       └── extractors/
│           ├── __init__.py
│           ├── base.py       # Abstract extractor interface
│           ├── claims.py     # LLM-based claim extraction
│           ├── sources.py    # Source metadata extraction
│           └── artifacts.py  # Artifact assembly from claims + sources
├── tests/
│   ├── test_pipeline.py
│   ├── test_extractors.py
│   └── fixtures/
│       └── sample_paper.json
└── .github/
    └── workflows/
        └── ingest.yml        # Scheduled ingestion runs
```

---

## Data Flow: Paper → Structured Knowledge

```
                         atlas-ingest
┌──────────┐    ┌──────────────────────────────────┐    ┌───────────┐
│  arXiv   │    │                                  │    │   Atlas   │
│  bioRxiv │───▶│  1. FETCH   paper metadata+PDF   │    │   API     │
│  PubMed  │    │  2. PARSE   PDF → text chunks    │    │           │
└──────────┘    │  3. EXTRACT LLM → Claims[]       │───▶│  POST     │
                │  4. STAMP   origin=ai_extracted   │    │  /sources │
                │  5. VALIDATE against JSON Schema  │    │  /claims  │
                │  6. PUSH    to Atlas REST API     │    │  /artifacts│
                └──────────────────────────────────┘    └─────┬─────┘
                                                              │
                                                              ▼
                                                     ┌───────────────┐
                                                     │  Human Review  │
                                                     │  Triage Queue  │
                                                     │                │
                                                     │  GET /claims   │
                                                     │  ?origin=      │
                                                     │   ai_extracted │
                                                     │  &reviewStatus=│
                                                     │   unreviewed   │
                                                     │                │
                                                     │  PATCH /claims │
                                                     │  /:id/review   │
                                                     └───────────────┘
```

---

## Provenance Model

Every object in Atlas now carries provenance metadata:

| Field | On | Values | Purpose |
|-------|-----|--------|---------|
| `origin` | Claims, Sources, Artifacts | `human`, `ai_extracted`, `ai_assisted` | Who/what created this object |
| `reviewStatus` | Claims, Sources, Artifacts | `unreviewed`, `human_verified`, `human_rejected` | Has a human validated this? |
| `extractionMeta` | Claims only | `{ model, sourcePassage, extractionConfidence, extractedAt, pipelineVersion }` | Full audit trail for AI extractions |

**Key design decisions:**

1. **`origin` is separate from `createdBy`** — `createdBy` identifies the specific agent/person; `origin` classifies the method.
2. **`reviewStatus` is separate from `status`** — A claim can be `status: published` but `reviewStatus: unreviewed`. Publication and human validation are independent axes.
3. **`extractionMeta` is a JSON blob** — Intentionally flexible. The schema validates top-level keys but allows `additionalProperties: true` so pipeline versions can add fields without a schema release.
4. **`extractionMeta.extractionConfidence` is separate from `confidence`** — The claim's `confidence` field is epistemological ("how confident is this claim?"). `extractionConfidence` is mechanical ("how confident is the AI that it read the paper correctly?").

---

## Auth Model for Ingestion

The existing `agent` role in the API key system is purpose-built for this:

```
api_keys.role: 'admin' | 'contributor' | 'agent'
```

- The ingestion pipeline authenticates as `role: agent`
- All write operations go through the same rate limits and validation as any other client
- The `agent` role can be given higher rate limits in the future (or a batch endpoint)

---

## Schema Sync Strategy

```
atlas-schemas (canonical)
    │
    ├─── atlas: npm install @korvo/atlas-schemas
    │    └── validation.ts imports schemas, AJV compiles them
    │
    └─── atlas-ingest: vendor or fetch schemas/*.json at build time
         └── datamodel-code-generator → Pydantic models
         └── pipeline validates output before POSTing
```

Both projects validate against the same schemas. If atlas-ingest produces an object that doesn't match the schema, it fails locally before ever hitting the API.

---

## Rate Limits & Batch Ingestion

Current limits (in `server.ts`):
- **Reads:** 300 req / 15 min
- **Writes:** 50 req / 15 min

For bulk ingestion, two options:

1. **Per-role rate tiers** — `agent` role gets 500 writes / 15 min
2. **Batch endpoint** — `POST /api/v1/batch` accepts arrays of sources + claims + artifacts in one request (future work)

---

## Deduplication

The ingestion pipeline must handle re-runs gracefully:

- **Sources:** Deduplicate by `url` + `contentHash` before POSTing
- **Claims:** Deduplicate by `statement` similarity + `sourceIds` overlap
- **Atlas core:** Consider adding `UNIQUE` constraint on `sources.url` or an upsert endpoint (future work)

---

## Getting Started

### Running Atlas (this repo)
```bash
npm install
npm run seed:fresh    # Reset DB with sample data
npm run dev           # Start API at localhost:3000
```

### Setting up atlas-ingest (separate repo)
```bash
git clone https://github.com/korvohq/atlas-ingest.git
cd atlas-ingest
cp .env.example .env  # Set ATLAS_API_URL, ATLAS_API_KEY, LLM_MODEL
uv sync               # Install dependencies
python -m atlas_ingest --source arxiv --query "AI safety" --limit 10
```

