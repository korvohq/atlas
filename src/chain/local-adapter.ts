/**
 * Local adapters for development and testing.
 *
 * These simulate blockchain anchoring and IPFS storage using
 * the local filesystem + SQLite, so developers can test the
 * full publish workflow without real chain infrastructure.
 *
 * In production, swap these out for real adapters:
 *   - BaseChainAdapter (Ethereum L2)
 *   - IpfsStorageAdapter (Pinata / Infura IPFS)
 *   - ArweaveStorageAdapter
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { ChainAdapter, ChainResult, StorageAdapter, StorageResult } from './types';

// ── Local Storage Adapter (simulates IPFS) ──────────────────────

const LOCAL_STORAGE_DIR = path.join(__dirname, '..', '..', '.atlas-storage');

export class LocalStorageAdapter implements StorageAdapter {
  constructor() {
    if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
      fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    }
  }

  async upload(content: string): Promise<StorageResult> {
    // Simulate content-addressed storage like IPFS:
    // the "CID" is a hash of the content
    const cid = 'Qm' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 44);
    const filePath = path.join(LOCAL_STORAGE_DIR, `${cid}.json`);

    fs.writeFileSync(filePath, content, 'utf8');

    return {
      cid,
      url: `file://${filePath}`,
      size: Buffer.byteLength(content, 'utf8'),
    };
  }

  async retrieve(cid: string): Promise<string> {
    const filePath = path.join(LOCAL_STORAGE_DIR, `${cid}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Content not found for CID: ${cid}`);
    }
    return fs.readFileSync(filePath, 'utf8');
  }
}

// ── Local Chain Adapter (simulates blockchain) ──────────────────

const LOCAL_CHAIN_FILE = path.join(LOCAL_STORAGE_DIR, '_chain_ledger.json');

interface LocalBlock {
  txHash: string;
  blockNumber: number;
  contentHash: string;
  ipfsCid: string;
  artifactId: string;
  publishedBy: string;
  previousVersionTx?: string;
  timestamp: string;
}

function readLedger(): LocalBlock[] {
  if (!fs.existsSync(LOCAL_CHAIN_FILE)) return [];
  return JSON.parse(fs.readFileSync(LOCAL_CHAIN_FILE, 'utf8'));
}

function writeLedger(blocks: LocalBlock[]): void {
  fs.writeFileSync(LOCAL_CHAIN_FILE, JSON.stringify(blocks, null, 2), 'utf8');
}

export class LocalChainAdapter implements ChainAdapter {
  readonly network = 'local' as const;

  async anchor(params: {
    contentHash: string;
    ipfsCid: string;
    artifactId: string;
    publishedBy: string;
    previousVersionTx?: string;
  }): Promise<ChainResult> {
    const ledger = readLedger();
    const blockNumber = ledger.length + 1;
    const timestamp = new Date().toISOString();

    // Simulate a tx hash (in production this comes from the real chain)
    const txHash = '0x' + crypto.createHash('sha256')
      .update(`${params.contentHash}:${params.ipfsCid}:${timestamp}`)
      .digest('hex');

    const block: LocalBlock = {
      txHash,
      blockNumber,
      contentHash: params.contentHash,
      ipfsCid: params.ipfsCid,
      artifactId: params.artifactId,
      publishedBy: params.publishedBy,
      previousVersionTx: params.previousVersionTx,
      timestamp,
    };

    ledger.push(block);
    writeLedger(ledger);

    console.log(`⛓️  [local-chain] Block #${blockNumber} — tx: ${txHash.slice(0, 18)}...`);

    return { txHash, chain: 'local', blockNumber, timestamp };
  }

  async verify(txHash: string): Promise<{
    valid: boolean;
    contentHash?: string;
    ipfsCid?: string;
    timestamp?: string;
  }> {
    const ledger = readLedger();
    const block = ledger.find((b) => b.txHash === txHash);

    if (!block) return { valid: false };

    return {
      valid: true,
      contentHash: block.contentHash,
      ipfsCid: block.ipfsCid,
      timestamp: block.timestamp,
    };
  }
}

