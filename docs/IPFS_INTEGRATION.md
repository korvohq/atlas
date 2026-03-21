# IPFS Integration — Korvo Atlas

> **Author:** Engineering Review  
> **Date:** 2026-03-21  
> **Status:** Proposed (MVP-ready)

---

## Summary

Atlas already has a **perfectly shaped seam** for real IPFS integration. The `StorageAdapter` interface, the `ipfsCid` column on artifacts/chain_records, and the publish workflow are all designed for this. The work is essentially: implement `IpfsStorageAdapter`, flip an env var, and add a retrieval endpoint.

**Estimated effort:** 1 day for MVP, 2 days with tests + gateway fallback.

---

## 1. Architecture Analysis — Where IPFS Fits

### Current Flow (Local Adapter)

```
POST /api/publish/:artifactId
  → buildBundle(artifact + claims + sources)
  → hashBundle(bundle) → SHA-256
  → LocalStorageAdapter.upload(json) → fake CID, writes to .atlas-storage/
  → LocalChainAdapter.anchor(hash, cid)
  → UPDATE artifacts SET ipfsCid, contentHash, txHash
  → INSERT INTO chain_records
```

### What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| `StorageAdapter` interface | ✅ Done | `upload(content) → {cid, url, size}`, `retrieve(cid) → string` |
| `ipfsCid` column on `artifacts` | ✅ Done | Set during publish |
| `ipfsCid` column on `chain_records` | ✅ Done | Set during publish |
| `getStorageAdapter()` factory | ✅ Done | Has TODO for `ATLAS_STORAGE_PROVIDER` env var |
| Bundle builder | ✅ Done | Deterministic JSON of artifact + claims + sources |
| Content hashing | ✅ Done | SHA-256 of canonical JSON |
| Verify flow | ✅ Done | Fetches from storage, re-hashes, compares to chain |
| Retrieval endpoint | ❌ Missing | No `GET /api/publish/:artifactId/bundle` |
| Real IPFS adapter | ❌ Missing | Only `LocalStorageAdapter` exists |

**Key insight:** The codebase was designed with this exact integration in mind. Every `TODO` comment in `publish.ts` points to environment-driven adapter selection.

---

## 2. Three Integration Approaches (Simple → Advanced)

### Approach A: IPFS HTTP API via Kubo Node (Simplest) ⭐ RECOMMENDED

- Talk to a local or remote Kubo node via its HTTP API (`/api/v0/add`, `/api/v0/cat`)
- Use plain `fetch` — zero new dependencies
- Works with any Kubo node: local `ipfs daemon`, Docker, Infura, or a VPS
- CID is a real IPFS CIDv1, globally addressable

**Pros:** Dead simple, real CIDs, no vendor lock-in, no npm package churn  
**Cons:** Requires a running Kubo node (trivial with Docker)

### Approach B: Pinning Service API (Pinata / web3.storage)

- Use a managed pinning service's REST API
- Content is pinned and replicated automatically
- Gateway URLs are provided by the service

**Pros:** No infra to run, high availability, built-in CDN gateways  
**Cons:** Vendor dependency, API keys, cost per GB, rate limits

### Approach C: Helia (JS-native IPFS) In-Process

- Embed a full IPFS node inside the Atlas process using Helia
- Content is stored and served from the same process

**Pros:** No external dependency, fully self-contained  
**Cons:** Heavy (libp2p, bitswap, DHT), memory-hungry, ESM-only (Atlas uses CJS), version churn, not production-ready for server workloads

### Verdict

**Approach A wins.** It's the simplest, produces real CIDs, has zero npm dependencies beyond Node's built-in `fetch`, and the Kubo HTTP API is stable and well-documented. For production, pair it with a pinning service (Approach B) as an optional secondary pin.

---

## 3. Recommended Approach — Detailed Design

### 3.1 What Gets Hashed and When

```
User calls POST /api/publish/:artifactId
  │
  ├─ 1. buildBundle() → deterministic JSON bundle
  │     {schemaVersion, artifact, question, claims, sources, publishedBy, publishedAt}
  │
  ├─ 2. hashBundle(bundle) → "sha256:<hex>"
  │     (canonical JSON with sorted keys)
  │
  ├─ 3. IpfsStorageAdapter.upload(bundleJson)
  │     │
  │     ├─ POST to Kubo /api/v0/add
  │     ├─ Kubo hashes content with SHA-256/multihash → CIDv1
  │     ├─ Returns: { cid: "bafy...", url: "https://gateway/ipfs/bafy...", size: N }
  │     │
  │     └─ CID is deterministic: same content = same CID, always
  │
  ├─ 4. chain.anchor(contentHash, ipfsCid) → txHash
  │
  └─ 5. UPDATE artifacts SET ipfsCid = "bafy...", contentHash = "sha256:..."
         INSERT INTO chain_records (ipfsCid, contentHash, txHash, ...)
```

### 3.2 Where CID Is Stored

| Table | Column | Example |
|-------|--------|---------|
| `artifacts` | `ipfsCid` | `bafkreig5...` |
| `chain_records` | `ipfsCid` | `bafkreig5...` |

No schema changes needed — these columns already exist.

### 3.3 How Retrieval Works

Two paths:

1. **Via Atlas API** (new endpoint):
   ```
   GET /api/v1/publish/:artifactId/bundle
   → Fetches from IPFS (or local cache), returns the full JSON bundle
   ```

2. **Via any IPFS gateway** (no Atlas needed):
   ```
   https://ipfs.io/ipfs/bafkreig5...
   https://dweb.link/ipfs/bafkreig5...
   https://gateway.pinata.cloud/ipfs/bafkreig5...
   ```

   Anyone with the CID can retrieve the bundle independently — that's the whole point of content-addressed storage.

### 3.4 Schema Changes

**None required.** The `ipfsCid` field already exists on both `artifacts` and `chain_records`. The artifact JSON schema already includes it. The only change is that the CID will now be a real IPFS CID (`bafkrei...`) instead of a simulated one (`Qm<sha256-hex>`).

---

## 4. MVP Implementation Plan (1–2 Days)

### Day 1: Core Integration

| # | Task | File(s) | Time |
|---|------|---------|------|
| 1 | Create `IpfsStorageAdapter` | `src/chain/ipfs-adapter.ts` | 1hr |
| 2 | Wire into `getStorageAdapter()` | `src/chain/publish.ts` | 15min |
| 3 | Add `ATLAS_IPFS_API_URL` config | `src/config.ts` | 15min |
| 4 | Add bundle retrieval endpoint | `src/routes/publish.ts` | 30min |
| 5 | Test with local Kubo node | manual | 1hr |
| 6 | Add Docker Compose for Kubo | `docker-compose.yml` | 15min |

### Day 2: Hardening (Optional)

| # | Task | Notes |
|---|------|-------|
| 7 | Gateway fallback on retrieve | Try Kubo first, then public gateway |
| 8 | CID validation helper | Verify CID format before storing |
| 9 | Health check for IPFS | `GET /health` includes IPFS status |
| 10 | Update OpenAPI spec | Document new endpoint + CID field semantics |

---

## 5. Example: Artifact → CID → Retrieval

### Step 1: Create an artifact

```bash
curl -X POST http://localhost:3000/api/v1/artifacts \
  -H "Authorization: Bearer atl_dev_admin_000000000000000000000000" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Synthetic Data Risks in LLM Training",
    "type": "brief",
    "body": "## Summary\nTraining on synthetic data causes model collapse...",
    "claimIds": ["<claim-uuid>"],
    "sourceIds": ["<source-uuid>"],
    "tags": ["AI", "synthetic data"]
  }'
```

### Step 2: Publish (creates CID)

```bash
curl -X POST http://localhost:3000/api/v1/publish/<artifact-id> \
  -H "Authorization: Bearer atl_dev_admin_000000000000000000000000" \
  -d '{"publishedBy": "alice"}'
```

Response:
```json
{
  "message": "Artifact published to chain successfully",
  "artifactId": "a1b2c3d4-...",
  "contentHash": "sha256:3f2a7b9c1d...",
  "ipfsCid": "bafkreihdwdcefgh4ijklmnopqrstuvwxyz234567890abcdefghijk",
  "txHash": "0xabc123...",
  "chain": "local",
  "storageUrl": "http://localhost:8080/ipfs/bafkreihdwdcefgh4...",
  "storageSize": 1847
}
```

### Step 3: Retrieve via CID

```bash
# Via Atlas API
curl http://localhost:3000/api/v1/publish/<artifact-id>/bundle

# Via any IPFS gateway (no Atlas needed!)
curl https://ipfs.io/ipfs/bafkreihdwdcefgh4ijklmnopqrstuvwxyz234567890abcdefghijk
```

Returns the full bundle:
```json
{
  "schemaVersion": "atlas/artifact/v1",
  "artifact": {
    "id": "a1b2c3d4-...",
    "title": "Synthetic Data Risks in LLM Training",
    "type": "brief",
    "body": "## Summary\nTraining on synthetic data causes model collapse...",
    "tags": ["AI", "synthetic data"],
    "createdAt": "2026-03-21T10:00:00Z"
  },
  "claims": [{ "id": "...", "statement": "...", "confidence": "high", ... }],
  "sources": [{ "id": "...", "title": "...", "url": "https://arxiv.org/...", ... }],
  "publishedBy": "alice",
  "publishedAt": "2026-03-21T10:05:00Z"
}
```

### Step 4: Verify

```bash
curl http://localhost:3000/api/v1/publish/<artifact-id>/verify
```

```json
{
  "verified": true,
  "contentHashMatch": true,
  "onChainRecord": { "valid": true, "contentHash": "sha256:3f2a7b...", "ipfsCid": "bafkrei..." }
}
```

---

## 6. Tradeoffs

### What Is Stored Where

| Data | IPFS | Atlas DB | Why |
|------|------|----------|-----|
| Full artifact bundle (JSON) | ✅ | ❌ (only metadata) | Content-addressable, independently retrievable |
| CID reference | ❌ | ✅ `artifacts.ipfsCid` | Lookup index |
| Content hash | ❌ | ✅ `artifacts.contentHash` | Quick integrity check without IPFS |
| Searchable fields (title, body, tags) | ❌ | ✅ via FTS5 | Fast full-text search |
| Chain anchor (txHash) | ❌ | ✅ `chain_records` | Proof reference |

**Principle:** IPFS stores the **immutable bundle**. Atlas DB stores the **searchable index + pointers**.

### Performance Considerations

| Concern | Mitigation |
|---------|------------|
| IPFS upload latency (~200-500ms) | Publish is already async; user expects it |
| IPFS retrieve latency (cold: 1-5s, warm: <200ms) | Cache bundles locally after first retrieve |
| Kubo node availability | Health check + graceful fallback to local adapter |
| Large bundles (>1MB) | Rare for JSON research bundles; typical size is 1-10KB |
| Gateway reliability | Use multiple gateways with fallback chain |

### Optional vs Required

| Feature | Default | Notes |
|---------|---------|-------|
| IPFS upload on publish | **Optional** | Falls back to `LocalStorageAdapter` if `ATLAS_IPFS_API_URL` not set |
| IPFS retrieval | **Optional** | Bundle endpoint works with any adapter |
| CID in artifact response | **Always** | Even local adapter produces a CID-like identifier |
| External gateway URLs | **Optional** | Only meaningful with real IPFS |

**The integration is 100% opt-in.** Existing behavior is unchanged unless you set the env var.

---

## 7. Configuration

```bash
# .env or environment variables

# Enable real IPFS (omit to keep using local adapter)
ATLAS_STORAGE_PROVIDER=ipfs

# Kubo API endpoint (default: local node)
ATLAS_IPFS_API_URL=http://localhost:5001

# Public gateway for CID URLs (default: localhost:8080)
ATLAS_IPFS_GATEWAY_URL=https://ipfs.io

# Optional: Timeout for IPFS operations in ms
ATLAS_IPFS_TIMEOUT=30000
```

### Running Kubo Locally

```bash
# Docker (easiest)
docker run -d --name ipfs -p 4001:4001 -p 5001:5001 -p 8080:8080 ipfs/kubo:latest

# Or install natively
# macOS: brew install kubo
# Then: ipfs init && ipfs daemon
```

---

## 8. Three-Month Roadmap Alignment

| Month | Milestone | IPFS Role |
|-------|-----------|-----------|
| **Month 1** | MVP: real CIDs on publish + retrieval endpoint | Core integration (this doc) |
| **Month 2** | Pinning service backup + CID in API responses | Resilience + discoverability |
| **Month 3** | CAR export, bulk pin, IPNS for mutable collections | Advanced features |

### Explicitly Out of Scope (for now)

- ❌ Helia / in-process IPFS node
- ❌ IPLD / DAG-CBOR encoding (JSON is fine for bundles)
- ❌ Filecoin deals (premature; pinning is sufficient)
- ❌ IPNS mutable names (month 3+)
- ❌ CAR file import/export (month 3+)
- ❌ Content encryption before upload (future: for private research)

---

## Files Changed

| File | Change |
|------|--------|
| `src/chain/ipfs-adapter.ts` | **New** — `IpfsStorageAdapter` class |
| `src/chain/publish.ts` | Wire `getStorageAdapter()` to check env |
| `src/chain/index.ts` | Export new adapter |
| `src/routes/publish.ts` | Add `GET /:artifactId/bundle` endpoint |
| `src/config.ts` | **New** — centralized config |
| `docker-compose.yml` | **New** — Kubo for local dev |

