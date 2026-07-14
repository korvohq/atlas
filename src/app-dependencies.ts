import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { ChainAdapter, StorageAdapter } from './chain/types';
import { config } from './config';
import { getDb } from './db/database';
import { IpfsStorageAdapter } from './chain/ipfs-adapter';
import { LocalChainAdapter, LocalStorageAdapter } from './chain/local-adapter';

export type Clock = () => Date;
export type IdGenerator = () => string;

export interface StorageRuntimeInfo {
  provider: 'local' | 'ipfs';
  apiUrl?: string;
  gatewayUrl?: string;
  isHealthy?: () => Promise<boolean>;
}

/** Runtime dependencies used by the HTTP app and publication workflow. */
export interface AppDependencies {
  db: Database.Database;
  storage: StorageAdapter;
  chain: ChainAdapter;
  now: Clock;
  generateId: IdGenerator;
  storageInfo: StorageRuntimeInfo;
}

export type RouteDependencies = Pick<AppDependencies, 'db' | 'now' | 'generateId'>;

/** Build production/development defaults without initializing the schema or starting a listener. */
export function createDefaultAppDependencies(): AppDependencies {
  const storage = config.storageProvider === 'ipfs'
    ? new IpfsStorageAdapter()
    : new LocalStorageAdapter();

  return {
    db: getDb(),
    storage,
    chain: new LocalChainAdapter(),
    now: () => new Date(),
    generateId: randomUUID,
    storageInfo: config.storageProvider === 'ipfs'
      ? {
          provider: 'ipfs',
          apiUrl: config.ipfs.apiUrl,
          gatewayUrl: config.ipfs.gatewayUrl,
          isHealthy: () => (storage as IpfsStorageAdapter).isHealthy(),
        }
      : { provider: 'local' },
  };
}

