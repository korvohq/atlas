import request from 'supertest';
import crypto from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalizeJson, hashBundle } from '../src/chain/hash';
import { ArtifactBundle } from '../src/chain/types';
import { createTestApp, insertApiKey, TestAppContext, TEST_NOW } from './helpers/test-app';

const SOURCE_ID = '20000000-0000-4000-8000-000000000001';
const CLAIM_ID = '30000000-0000-4000-8000-000000000001';
const ARTIFACT_ID = '40000000-0000-4000-8000-000000000001';

let context: TestAppContext | undefined;

afterEach(() => {
  context?.close();
  context = undefined;
});

function seedPublishableArtifact(testContext: TestAppContext): void {
  const { db } = testContext.dependencies;
  const timestamp = TEST_NOW.toISOString();

  db.prepare(`
    INSERT INTO sources (id, type, title, url, tags, origin, reviewStatus, createdBy, createdAt, updatedAt)
    VALUES (?, 'paper', ?, ?, '[]', 'human', 'human_verified', 'Test Admin', ?, ?)
  `).run(SOURCE_ID, 'Canonical research source', 'https://example.com/source', timestamp, timestamp);

  db.prepare(`
    INSERT INTO claims (
      id, statement, confidence, sourceIds, status, tags, origin, reviewStatus,
      createdBy, createdAt, updatedAt
    ) VALUES (?, ?, 'high', ?, 'draft', '[]', 'human', 'human_verified', 'Test Admin', ?, ?)
  `).run(
    CLAIM_ID,
    'A nested claim must be covered by the publication content hash.',
    JSON.stringify([SOURCE_ID]),
    timestamp,
    timestamp,
  );

  db.prepare(`
    INSERT INTO artifacts (
      id, title, type, body, claimIds, sourceIds, status, tags, origin,
      reviewStatus, createdBy, createdAt, updatedAt
    ) VALUES (?, ?, 'brief', ?, ?, ?, 'draft', '[]', 'human', 'human_verified', 'Test Admin', ?, ?)
  `).run(
    ARTIFACT_ID,
    'Canonical publication test',
    'The exact nested research content must be stored and hashed.',
    JSON.stringify([CLAIM_ID]),
    JSON.stringify([SOURCE_ID]),
    timestamp,
    timestamp,
  );
}

describe('v1 publication integrity', () => {
  it('hashes and uploads the exact same canonical bundle bytes using injected adapters', async () => {
    context = createTestApp();
    insertApiKey(context.dependencies);
    seedPublishableArtifact(context);

    const published = await request(context.app)
      .post(`/api/v1/publish/${ARTIFACT_ID}`)
      .set('Authorization', 'Bearer atl_test_admin')
      .send({})
      .expect(201);

    expect(context.storage.uploads).toHaveLength(1);
    expect(context.chain.anchors).toHaveLength(1);

    const storedBytes = context.storage.uploads[0];
    const storedBundle = JSON.parse(storedBytes) as ArtifactBundle;
    expect(storedBytes).toBe(canonicalizeJson(storedBundle));
    expect(published.body.contentHash).toBe(hashBundle(storedBundle));
    expect(published.body.canonicalizationVersion).toBe('rfc8785-jcs-v1');
    expect(storedBundle.canonicalizationVersion).toBe('rfc8785-jcs-v1');
    expect(context.chain.anchors[0].contentHash).toBe(published.body.contentHash);
    expect(storedBundle.publishedBy).toBe('Test Admin');

    const record = context.dependencies.db
      .prepare('SELECT * FROM chain_records WHERE artifactId = ?')
      .get(ARTIFACT_ID) as Record<string, unknown>;
    expect(record.contentHash).toBe(published.body.contentHash);
    expect(record.txHash).toBe('test-tx-1');

    const verification = await request(context.app)
      .get(`/api/v1/publish/${ARTIFACT_ID}/verify`)
      .expect(200);
    expect(verification.body).toMatchObject({
      verified: true,
      contentHashMatch: true,
      integrityScope: 'full_content_rfc8785',
      canonicalizationVersion: 'rfc8785-jcs-v1',
    });

    const bundle = await request(context.app)
      .get(`/api/v1/publish/${ARTIFACT_ID}/bundle`)
      .expect(200);
    expect(bundle.body).toEqual(storedBundle);
    expect(bundle.headers['x-content-hash']).toBe(published.body.contentHash);
  });

  it('changes the hash when a nested claim changes', () => {
    const bundle = {
      schemaVersion: 'atlas/artifact/v1',
      artifact: {
        id: ARTIFACT_ID,
        title: 'Nested mutation regression',
        type: 'brief',
        body: 'Body',
        tags: [],
        createdAt: TEST_NOW.toISOString(),
      },
      claims: [{
        id: CLAIM_ID,
        statement: 'The original nested claim.',
        confidence: 'high',
        sourceIds: [SOURCE_ID],
        status: 'draft',
      }],
      sources: [{ id: SOURCE_ID, type: 'paper', title: 'Source' }],
      publishedBy: 'Test Admin',
      publishedAt: TEST_NOW.toISOString(),
    } satisfies ArtifactBundle;

    const changed = structuredClone(bundle);
    changed.claims[0].statement = 'The opposite nested claim.';

    expect(hashBundle(changed)).not.toBe(hashBundle(bundle));
  });

  it('classifies an unmarked v1 bundle as legacy instead of full-content verified', async () => {
    context = createTestApp();
    seedPublishableArtifact(context);

    const legacyBundle: ArtifactBundle = {
      schemaVersion: 'atlas/artifact/v1',
      artifact: {
        id: ARTIFACT_ID,
        title: 'Legacy bundle',
        type: 'brief',
        body: 'This nested body was not covered by the legacy hash.',
        tags: [],
        createdAt: TEST_NOW.toISOString(),
      },
      claims: [],
      sources: [],
      publishedBy: 'legacy-actor',
      publishedAt: TEST_NOW.toISOString(),
    };
    const stored = await context.storage.upload(JSON.stringify(legacyBundle));
    const legacyCanonical = JSON.stringify(
      legacyBundle,
      Object.keys(legacyBundle).sort(),
    );
    const legacyHash = `sha256:${crypto.createHash('sha256').update(legacyCanonical).digest('hex')}`;
    const anchored = await context.chain.anchor({
      artifactId: ARTIFACT_ID,
      contentHash: legacyHash,
      ipfsCid: stored.cid,
      publishedBy: 'legacy-actor',
    });
    context.dependencies.db.prepare(`
      UPDATE artifacts SET contentHash = ?, ipfsCid = ?, txHash = ?, chain = 'local'
      WHERE id = ?
    `).run(legacyHash, stored.cid, anchored.txHash, ARTIFACT_ID);

    const verification = await request(context.app)
      .get(`/api/v1/publish/${ARTIFACT_ID}/verify`)
      .expect(422);

    expect(verification.body).toMatchObject({
      verified: false,
      contentHashMatch: false,
      integrityScope: 'legacy_top_level_only',
    });
    expect(verification.body.error).toContain('cannot be verified as full content');
  });
});

