#!/usr/bin/env ts-node
/**
 * Atlas Verification CLI
 *
 * Independently verify that a published artifact's content matches
 * its on-chain proof. No trust in the Atlas API required.
 *
 * Usage:
 *   npx ts-node scripts/verify.ts <artifactId>
 *   npm run verify -- <artifactId>
 */

import { initDb, getDb } from '../src/db/database';
import { hashBundle } from '../src/chain/hash';
import { LocalStorageAdapter } from '../src/chain/local-adapter';
import { LocalChainAdapter } from '../src/chain/local-adapter';
import { ArtifactBundle } from '../src/chain/types';

type Row = Record<string, any>;

const artifactId = process.argv[2];

if (!artifactId) {
  console.error('❌ Usage: npx ts-node scripts/verify.ts <artifactId>');
  console.error('         npm run verify -- <artifactId>');
  process.exit(1);
}

async function verify() {
  initDb();
  const db = getDb();

  console.log('═══════════════════════════════════════════════════════');
  console.log('  🔍 KORVO ATLAS — INDEPENDENT VERIFICATION REPORT');
  console.log('═══════════════════════════════════════════════════════');
  console.log();

  // ── Step 1: Fetch artifact from Atlas DB ──
  console.log('Step 1: Fetching artifact from database...');
  const artifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifactId) as Row | undefined;

  if (!artifact) {
    console.error(`  ❌ Artifact not found: ${artifactId}`);
    process.exit(1);
  }

  console.log(`  ✅ Found: "${artifact.title}"`);
  console.log(`     Status: ${artifact.status}`);
  console.log(`     Created: ${artifact.createdAt}`);
  console.log();

  if (!artifact.txHash) {
    console.log('  ⚠️  This artifact has NOT been published to chain.');
    console.log('     No on-chain proof exists. Nothing to verify.');
    process.exit(0);
  }

  console.log(`  Chain:        ${artifact.chain}`);
  console.log(`  txHash:       ${artifact.txHash}`);
  console.log(`  ipfsCid:      ${artifact.ipfsCid}`);
  console.log(`  contentHash:  ${artifact.contentHash}`);
  console.log();

  // ── Step 2: Fetch on-chain record ──
  console.log('Step 2: Verifying on-chain record...');
  const chain = new LocalChainAdapter();
  const chainRecord = await chain.verify(artifact.txHash);

  if (!chainRecord.valid) {
    console.error('  ❌ FAIL — On-chain record not found for this txHash.');
    console.error('     The blockchain has no proof of this artifact.');
    process.exit(1);
  }

  console.log(`  ✅ On-chain record found`);
  console.log(`     Chain contentHash: ${chainRecord.contentHash}`);
  console.log(`     Chain ipfsCid:     ${chainRecord.ipfsCid}`);
  console.log(`     Chain timestamp:   ${chainRecord.timestamp}`);
  console.log();

  // ── Step 3: Check DB contentHash matches chain ──
  console.log('Step 3: Comparing Atlas DB hash with on-chain hash...');
  const dbMatchesChain = artifact.contentHash === chainRecord.contentHash;
  if (dbMatchesChain) {
    console.log('  ✅ MATCH — Atlas DB contentHash matches on-chain contentHash');
  } else {
    console.error('  ❌ MISMATCH — Atlas DB has a different hash than the chain.');
    console.error(`     DB:    ${artifact.contentHash}`);
    console.error(`     Chain: ${chainRecord.contentHash}`);
  }
  console.log();

  // ── Step 4: Fetch from storage and re-hash ──
  console.log('Step 4: Fetching content from storage and re-hashing...');
  const storage = new LocalStorageAdapter();
  let contentMatchesChain = false;

  try {
    const storedContent = await storage.retrieve(artifact.ipfsCid);
    const bundle: ArtifactBundle = JSON.parse(storedContent);
    const recomputedHash = hashBundle(bundle);

    console.log(`  Retrieved bundle: ${Buffer.byteLength(storedContent)} bytes`);
    console.log(`  Recomputed hash:  ${recomputedHash}`);

    contentMatchesChain = recomputedHash === chainRecord.contentHash;
    if (contentMatchesChain) {
      console.log('  ✅ MATCH — Stored content hash matches on-chain hash');
    } else {
      console.error('  ❌ MISMATCH — Content has been tampered with or corrupted.');
      console.error(`     Recomputed: ${recomputedHash}`);
      console.error(`     On-chain:   ${chainRecord.contentHash}`);
    }
  } catch (err: any) {
    console.error(`  ⚠️  Could not retrieve content from storage: ${err.message}`);
    console.log('     (This is expected if using local adapter and storage was cleared)');
  }
  console.log();

  // ── Step 5: Check chain_records table ──
  console.log('Step 5: Checking chain_records table...');
  const record = db.prepare('SELECT * FROM chain_records WHERE artifactId = ? ORDER BY publishedAt DESC').get(artifactId) as Row | undefined;
  if (record) {
    console.log(`  ✅ Chain record found in DB`);
    console.log(`     Published by: ${record.publishedBy}`);
    console.log(`     Block number: ${record.blockNumber}`);
    console.log(`     Published at: ${record.publishedAt}`);
    if (record.previousVersionTx) {
      console.log(`     Previous ver: ${record.previousVersionTx}`);
    }
  } else {
    console.log('  ⚠️  No chain_records entry found (may be inconsistent)');
  }
  console.log();

  // ── Final verdict ──
  console.log('═══════════════════════════════════════════════════════');
  const allPassed = chainRecord.valid && dbMatchesChain && contentMatchesChain;
  if (allPassed) {
    console.log('  ✅ VERDICT: VERIFIED');
    console.log('  This artifact is authentic and untampered.');
    console.log('  Its content matches the on-chain proof exactly.');
  } else {
    console.log('  ❌ VERDICT: VERIFICATION FAILED');
    if (!chainRecord.valid) console.log('  • No on-chain record found');
    if (!dbMatchesChain) console.log('  • Database hash does not match chain');
    if (!contentMatchesChain) console.log('  • Stored content does not match chain');
  }
  console.log('═══════════════════════════════════════════════════════');

  process.exit(allPassed ? 0 : 1);
}

verify().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

