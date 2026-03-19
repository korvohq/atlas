/**
 * Types for the Atlas blockchain publish layer.
 *
 * Atlas uses a three-layer architecture:
 *   Layer 1 — Blockchain: immutable proof (hash + pointer)
 *   Layer 2 — IPFS/Arweave: decentralized content storage
 *   Layer 3 — Atlas API: searchable index + gateway
 */

/** Supported blockchain networks */
export type ChainNetwork = 'base' | 'arbitrum' | 'solana' | 'polygon' | 'local';

/** The bundle that gets hashed and stored on IPFS before anchoring */
export interface ArtifactBundle {
  schemaVersion: string;
  artifact: {
    id: string;
    title: string;
    type: string;
    body: string;
    summary?: string;
    tags: string[];
    createdBy?: string;
    createdAt: string;
  };
  question?: {
    id: string;
    text: string;
    context?: string;
  };
  claims: Array<{
    id: string;
    statement: string;
    confidence: string;
    sourceIds: string[];
    status: string;
  }>;
  sources: Array<{
    id: string;
    type: string;
    title: string;
    url?: string;
    author?: string;
    contentHash?: string;
  }>;
  publishedBy: string;
  publishedAt: string;
}

/** Result returned after content is uploaded to decentralized storage */
export interface StorageResult {
  cid: string;        // IPFS CID or Arweave tx ID
  url: string;        // Gateway URL to access the content
  size: number;       // Content size in bytes
}

/** Result returned after the blockchain transaction is confirmed */
export interface ChainResult {
  txHash: string;
  chain: ChainNetwork;
  blockNumber?: number;
  timestamp: string;
}

/** Full result of a publish operation */
export interface PublishResult {
  contentHash: string;
  storage: StorageResult;
  chain: ChainResult;
  bundle: ArtifactBundle;
}

/**
 * Chain adapter interface — pluggable backend for different blockchains.
 * Implement this for each chain you want to support.
 */
export interface ChainAdapter {
  readonly network: ChainNetwork;

  /** Anchor a content hash on-chain */
  anchor(params: {
    contentHash: string;
    ipfsCid: string;
    artifactId: string;
    publishedBy: string;
    previousVersionTx?: string;
  }): Promise<ChainResult>;

  /** Verify an on-chain record matches the expected content hash */
  verify(txHash: string): Promise<{
    valid: boolean;
    contentHash?: string;
    ipfsCid?: string;
    timestamp?: string;
  }>;
}

/**
 * Storage adapter interface — pluggable backend for decentralized storage.
 * Implement this for IPFS, Arweave, etc.
 */
export interface StorageAdapter {
  /** Upload content and return the content identifier */
  upload(content: string): Promise<StorageResult>;

  /** Retrieve content by its identifier */
  retrieve(cid: string): Promise<string>;
}

