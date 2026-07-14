import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  CANONICALIZATION_VERSION,
  CanonicalizationVersion,
  canonicalizeJson,
  hashBundle,
  verifyHash,
} from '../src/chain/hash';
import { ArtifactBundle } from '../src/chain/types';

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/canonicalization');

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as T;
}

function readExpected(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8').trimEnd();
}

describe('RFC 8785 canonicalization', () => {
  it('matches the committed artifact golden bytes and SHA-256', () => {
    const bundle = readJson<ArtifactBundle>('artifact-bundle.json');
    const expectedCanonical = readExpected('artifact-bundle.canonical.json');
    const expectedHash = readExpected('artifact-bundle.sha256');

    expect(CANONICALIZATION_VERSION).toBe('rfc8785-jcs-v1');
    expect(canonicalizeJson(bundle)).toBe(expectedCanonical);
    expect(Buffer.from(canonicalizeJson(bundle), 'utf8')).toEqual(Buffer.from(expectedCanonical, 'utf8'));
    expect(hashBundle(bundle)).toBe(expectedHash);
    expect(verifyHash(bundle, expectedHash)).toBe(true);
  });

  it('produces identical bytes and hashes for recursively reordered object keys', () => {
    const original = readJson<ArtifactBundle>('artifact-bundle.json');
    const reordered = readJson<ArtifactBundle>('artifact-bundle-reordered.json');

    expect(canonicalizeJson(reordered)).toBe(canonicalizeJson(original));
    expect(hashBundle(reordered)).toBe(hashBundle(original));
  });

  it('matches the changed nested-content fixture and gives it a different hash', () => {
    const original = readJson<ArtifactBundle>('artifact-bundle.json');
    const changed = readJson<ArtifactBundle>('artifact-bundle-nested-change.json');

    expect(canonicalizeJson(changed)).toBe(
      readExpected('artifact-bundle-nested-change.canonical.json'),
    );
    expect(hashBundle(changed)).toBe(readExpected('artifact-bundle-nested-change.sha256'));
    expect(hashBundle(changed)).not.toBe(hashBundle(original));
  });

  it('matches Unicode, escaping, and supported numeric boundary fixtures', () => {
    const fixture = readJson<unknown>('unicode-numbers.json');
    const canonical = canonicalizeJson(fixture);

    expect(canonical).toBe(readExpected('unicode-numbers.canonical.json'));
    expect(Buffer.from(canonical, 'utf8').toString('hex')).toBe(
      Buffer.from(readExpected('unicode-numbers.canonical.json'), 'utf8').toString('hex'),
    );
    expect(`sha256:${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')}`).toBe(
      readExpected('unicode-numbers.sha256'),
    );
  });

  it('preserves array order as protocol-significant', () => {
    expect(canonicalizeJson({ values: ['first', 'second'] })).not.toBe(
      canonicalizeJson({ values: ['second', 'first'] }),
    );
  });

  it('fails closed for unsupported versions and non-JSON numeric values', () => {
    expect(() => canonicalizeJson(
      {},
      'unknown-version' as CanonicalizationVersion,
    )).toThrow('Unsupported canonicalization version');
    expect(() => canonicalizeJson({ value: Number.NaN })).toThrow('NaN is not allowed');
    expect(() => canonicalizeJson({ value: Number.POSITIVE_INFINITY })).toThrow('Infinity is not allowed');
    expect(() => canonicalizeJson(undefined)).toThrow('cannot be represented as canonical JSON');
  });
});

