import { Express } from 'express';
import { createApp } from '../../src/app';
import { AppDependencies } from '../../src/app-dependencies';
import { createDatabase, initDb } from '../../src/db/database';
import {
  ChainAdapter,
  ChainResult,
  StorageAdapter,
  StorageResult,
} from '../../src/chain/types';

export const TEST_NOW = new Date('2026-07-14T12:00:00.000Z');

export class MemoryStorageAdapter implements StorageAdapter {
  readonly uploads: string[] = [];
  private readonly content = new Map<string, string>();

  async upload(value: string): Promise<StorageResult> {
    this.uploads.push(value);
    const cid = `memory-${this.uploads.length}`;
    this.content.set(cid, value);
    return {
      cid,
      url: `memory://${cid}`,
      size: Buffer.byteLength(value, 'utf8'),
    };
  }

  async retrieve(cid: string): Promise<string> {
    const value = this.content.get(cid);
    if (value === undefined) throw new Error(`Content not found for CID: ${cid}`);
    return value;
  }
}

export class MemoryChainAdapter implements ChainAdapter {
  readonly network = 'local' as const;
  readonly anchors: Parameters<ChainAdapter['anchor']>[0][] = [];
  private readonly records = new Map<string, Parameters<ChainAdapter['anchor']>[0]>();

  async anchor(params: Parameters<ChainAdapter['anchor']>[0]): Promise<ChainResult> {
    this.anchors.push(params);
    const txHash = `test-tx-${this.anchors.length}`;
    this.records.set(txHash, params);
    return {
      txHash,
      chain: 'local',
      blockNumber: this.anchors.length,
      timestamp: TEST_NOW.toISOString(),
    };
  }

  async verify(txHash: string): ReturnType<ChainAdapter['verify']> {
    const record = this.records.get(txHash);
    return record
      ? {
          valid: true,
          contentHash: record.contentHash,
          ipfsCid: record.ipfsCid,
          timestamp: TEST_NOW.toISOString(),
        }
      : { valid: false };
  }
}

export interface TestAppContext {
  app: Express;
  dependencies: AppDependencies;
  storage: MemoryStorageAdapter;
  chain: MemoryChainAdapter;
  close: () => void;
}

export function createTestApp(): TestAppContext {
  const db = createDatabase(':memory:');
  initDb(db);

  let nextId = 1;
  const generateId = () => {
    const suffix = String(nextId++).padStart(12, '0');
    return `00000000-0000-4000-8000-${suffix}`;
  };

  const storage = new MemoryStorageAdapter();
  const chain = new MemoryChainAdapter();
  const dependencies: AppDependencies = {
    db,
    storage,
    chain,
    now: () => new Date(TEST_NOW),
    generateId,
    storageInfo: { provider: 'local' },
  };

  return {
    app: createApp(dependencies, { rateLimit: false }),
    dependencies,
    storage,
    chain,
    close: () => db.close(),
  };
}

export function insertApiKey(
  dependencies: AppDependencies,
  key = 'atl_test_admin',
  role: 'admin' | 'contributor' | 'agent' = 'admin',
): void {
  dependencies.db.prepare(`
    INSERT INTO api_keys (id, key, name, role, createdAt, revokedAt)
    VALUES (?, ?, ?, ?, ?, NULL)
  `).run('10000000-0000-4000-8000-000000000000', key, 'Test Admin', role, TEST_NOW.toISOString());
}

