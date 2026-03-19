/**
 * Content hashing for Atlas artifact bundles.
 *
 * The hash is the fingerprint of the research — it's what gets
 * written to the blockchain. If even a single character changes,
 * the hash changes, and the on-chain proof won't match.
 */

import crypto from 'crypto';
import { ArtifactBundle } from './types';

/**
 * Produce a deterministic SHA-256 hash of an artifact bundle.
 *
 * The bundle is JSON-stringified with sorted keys to ensure
 * the same content always produces the same hash, regardless
 * of property insertion order.
 */
export function hashBundle(bundle: ArtifactBundle): string {
  const canonical = JSON.stringify(bundle, Object.keys(bundle).sort());
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Verify that a bundle matches an expected content hash.
 */
export function verifyHash(bundle: ArtifactBundle, expectedHash: string): boolean {
  return hashBundle(bundle) === expectedHash;
}

