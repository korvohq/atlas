/**
 * Content hashing for Atlas artifact bundles.
 *
 * The hash is the fingerprint of the research — it's what gets
 * written to the blockchain. If even a single character changes,
 * the hash changes, and the on-chain proof won't match.
 */

import crypto from 'crypto';
import canonicalize from 'canonicalize';
import { ArtifactBundle } from './types';

export const CANONICALIZATION_VERSION = 'rfc8785-jcs-v1' as const;
export type CanonicalizationVersion = typeof CANONICALIZATION_VERSION;

/** Canonicalize JSON recursively using the versioned Atlas integrity algorithm. */
export function canonicalizeJson(
  value: unknown,
  version: CanonicalizationVersion = CANONICALIZATION_VERSION,
): string {
  if (version !== CANONICALIZATION_VERSION) {
    throw new Error(`Unsupported canonicalization version: ${version}`);
  }

  const canonical = canonicalize(value);
  if (canonical === undefined) {
    throw new TypeError('The value cannot be represented as canonical JSON');
  }
  return canonical;
}

/**
 * Produce a deterministic SHA-256 hash of an artifact bundle.
 *
 * RFC 8785 recursively sorts object properties while preserving array order.
 */
export function hashBundle(
  bundle: ArtifactBundle,
  version: CanonicalizationVersion = CANONICALIZATION_VERSION,
): string {
  const canonicalBytes = Buffer.from(canonicalizeJson(bundle, version), 'utf8');
  const hash = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Verify that a bundle matches an expected content hash.
 */
export function verifyHash(
  bundle: ArtifactBundle,
  expectedHash: string,
  version: CanonicalizationVersion = CANONICALIZATION_VERSION,
): boolean {
  const actual = Buffer.from(hashBundle(bundle, version), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

