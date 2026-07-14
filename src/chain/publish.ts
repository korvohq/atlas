/**
 * Development publication workflow using injected storage and attestation adapters.
 *
 * When a researcher publishes an artifact, this module:
 *   1. Bundles the artifact + its claims + sources into one package
 *   2. Hashes the bundle (SHA-256)
 *   3. Writes the bundle to the configured storage adapter
 *   4. Records the hash with the configured attestation adapter
 *   5. Writes the publication record back to Atlas DB
 *
 * Local adapters are simulations; this workflow does not prove truth or permanence.
 */

import type { AppDependencies } from '../app-dependencies';
import { CANONICALIZATION_VERSION, canonicalizeJson, hashBundle } from './hash';
import type { ArtifactBundle, PublishResult } from './types';
type Row = Record<string, any>;

// ── Bundle builder ──────────────────────────────────────────────

export function buildBundle(
  artifactId: string,
  publishedBy: string,
  { db, now }: Pick<AppDependencies, 'db' | 'now'>,
): ArtifactBundle {

  // Fetch the artifact
  const artifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifactId) as Row | undefined;
  if (!artifact) throw new Error(`Artifact not found: ${artifactId}`);
  if (artifact.txHash) throw new Error(`Artifact already published on-chain (tx: ${artifact.txHash})`);

  const claimIds: string[] = JSON.parse(artifact.claimIds || '[]');
  const sourceIds: string[] = JSON.parse(artifact.sourceIds || '[]');
  const tags: string[] = JSON.parse(artifact.tags || '[]');

  // Fetch related claims
  const claims: ArtifactBundle['claims'] = [];
  for (const cid of claimIds) {
    const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(cid) as Row | undefined;
    if (claim) {
      claims.push({
        id: claim.id,
        statement: claim.statement,
        confidence: claim.confidence,
        sourceIds: JSON.parse(claim.sourceIds || '[]'),
        status: claim.status,
        origin: claim.origin || undefined,
        extractionMeta: claim.extractionMeta ? JSON.parse(claim.extractionMeta) : undefined,
      });
    }
  }

  // Fetch related sources
  const sources: ArtifactBundle['sources'] = [];
  for (const sid of sourceIds) {
    const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(sid) as Row | undefined;
    if (source) {
      sources.push({
        id: source.id,
        type: source.type,
        title: source.title,
        url: source.url || undefined,
        author: source.author || undefined,
        contentHash: source.contentHash || undefined,
        origin: source.origin || undefined,
      });
    }
  }

  // Fetch the question (if linked)
  let question: ArtifactBundle['question'];
  if (artifact.questionId) {
    const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(artifact.questionId) as Row | undefined;
    if (q) {
      question = { id: q.id, text: q.text, context: q.context || undefined };
    }
  }

  return {
    schemaVersion: 'atlas/artifact/v1',
    canonicalizationVersion: CANONICALIZATION_VERSION,
    artifact: {
      id: artifact.id,
      title: artifact.title,
      type: artifact.type,
      body: artifact.body,
      summary: artifact.summary || undefined,
      tags,
      createdBy: artifact.createdBy || undefined,
      createdAt: artifact.createdAt,
    },
    question,
    claims,
    sources,
    publishedBy,
    publishedAt: now().toISOString(),
  };
}

// ── Publish ─────────────────────────────────────────────────────

export async function publishToChain(
  artifactId: string,
  publishedBy: string,
  dependencies: AppDependencies,
): Promise<PublishResult> {
  const { db, storage, chain, now, generateId } = dependencies;

  console.log(`📦 Building bundle for artifact ${artifactId}...`);

  // 1. Build the bundle
  const bundle = buildBundle(artifactId, publishedBy, dependencies);

  // 2. Hash the bundle
  const contentHash = hashBundle(bundle);
  console.log(`🔒 Content hash: ${contentHash}`);

  // 3. Upload to decentralized storage
  const bundleJson = canonicalizeJson(bundle);
  const storageResult = await storage.upload(bundleJson);
  console.log(`📤 Uploaded to storage: ${storageResult.cid} (${storageResult.size} bytes)`);

  // 4. Check if this is a new version of a previously published artifact
  const existing = db.prepare('SELECT txHash FROM artifacts WHERE id = ?').get(artifactId) as Row | undefined;
  const previousVersionTx = existing?.txHash || undefined;

  // 5. Anchor on blockchain
  const chainResult = await chain.anchor({
    contentHash,
    ipfsCid: storageResult.cid,
    artifactId,
    publishedBy,
    previousVersionTx,
  });
  console.log(`⛓️  Anchored on ${chainResult.chain}: ${chainResult.txHash}`);

  // 6. Write chain record to Atlas DB
  const timestamp = now().toISOString();
  db.prepare(`
    INSERT INTO chain_records (id, artifactId, contentHash, ipfsCid, chain, txHash, blockNumber, publishedBy, previousVersionTx, publishedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId(), artifactId, contentHash, storageResult.cid,
    chainResult.chain, chainResult.txHash, chainResult.blockNumber || null,
    publishedBy, previousVersionTx || null, timestamp,
  );

  // 7. Update the artifact with chain info
  db.prepare(`
    UPDATE artifacts SET contentHash = ?, ipfsCid = ?, txHash = ?, chain = ?, publishedToChainAt = ?, previousVersionTx = ?, status = 'published', updatedAt = ?
    WHERE id = ?
  `).run(
    contentHash, storageResult.cid, chainResult.txHash,
    chainResult.chain, timestamp, previousVersionTx || null, timestamp, artifactId,
  );

  console.log(`✅ Artifact ${artifactId} published to chain successfully.`);

  return {
    contentHash,
    storage: storageResult,
    chain: chainResult,
    bundle,
  };
}

// ── Verify ──────────────────────────────────────────────────────

export async function verifyArtifact(
  artifactId: string,
  { db, storage, chain }: Pick<AppDependencies, 'db' | 'storage' | 'chain'>,
): Promise<{
  verified: boolean;
  contentHashMatch: boolean;
  onChainRecord: any;
  integrityScope: 'full_content_rfc8785' | 'legacy_top_level_only' | 'unknown';
  canonicalizationVersion?: string;
  error?: string;
}> {

  // 1. Get the artifact from Atlas DB
  const artifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifactId) as Row | undefined;
  if (!artifact) return { verified: false, contentHashMatch: false, onChainRecord: null, integrityScope: 'unknown', error: 'Artifact not found' };
  if (!artifact.txHash) return { verified: false, contentHashMatch: false, onChainRecord: null, integrityScope: 'unknown', error: 'Artifact not published to chain' };

  // 2. Verify the on-chain record
  const onChainRecord = await chain.verify(artifact.txHash);
  if (!onChainRecord.valid) {
    return { verified: false, contentHashMatch: false, onChainRecord, integrityScope: 'unknown', error: 'On-chain record not found' };
  }

  // 3. Fetch from storage and re-hash
  let contentHashMatch = false;
  let integrityScope: 'full_content_rfc8785' | 'legacy_top_level_only' | 'unknown' = 'unknown';
  let canonicalizationVersion: string | undefined;
  try {
    const storedContent = await storage.retrieve(artifact.ipfsCid);
    const storedBundle = JSON.parse(storedContent) as ArtifactBundle;
    canonicalizationVersion = storedBundle.canonicalizationVersion;
    if (!canonicalizationVersion) {
      return {
        verified: false,
        contentHashMatch: false,
        onChainRecord,
        integrityScope: 'legacy_top_level_only',
        error: 'Legacy bundle has top-level-only integrity and cannot be verified as full content',
      };
    }
    if (canonicalizationVersion !== CANONICALIZATION_VERSION) {
      return {
        verified: false,
        contentHashMatch: false,
        onChainRecord,
        integrityScope: 'unknown',
        canonicalizationVersion,
        error: `Unsupported canonicalization version: ${canonicalizationVersion}`,
      };
    }
    const recomputedHash = hashBundle(storedBundle);
    contentHashMatch = recomputedHash === onChainRecord.contentHash;
    integrityScope = 'full_content_rfc8785';
  } catch {
    // Storage retrieval failed — can't verify content, but chain record exists
  }

  return {
    verified: onChainRecord.valid && contentHashMatch,
    contentHashMatch,
    onChainRecord,
    integrityScope,
    canonicalizationVersion,
  };
}

