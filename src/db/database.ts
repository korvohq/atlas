import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'atlas.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDb(): void {
  const conn = getDb();

  conn.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      context TEXT,
      tags TEXT,            -- JSON array
      status TEXT NOT NULL DEFAULT 'open',
      createdBy TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      author TEXT,
      publishedAt TEXT,
      retrievedAt TEXT,
      contentHash TEXT,
      tags TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      statement TEXT NOT NULL,
      confidence TEXT NOT NULL,
      sourceIds TEXT NOT NULL,   -- JSON array of source IDs
      questionId TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      tags TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      FOREIGN KEY (questionId) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      body TEXT NOT NULL,
      summary TEXT,
      questionId TEXT,
      claimIds TEXT NOT NULL,    -- JSON array
      sourceIds TEXT NOT NULL,   -- JSON array
      status TEXT NOT NULL DEFAULT 'draft',
      tags TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      -- Blockchain fields (populated on publish)
      contentHash TEXT,
      ipfsCid TEXT,
      txHash TEXT,
      chain TEXT,
      publishedToChainAt TEXT,
      previousVersionTx TEXT,
      FOREIGN KEY (questionId) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS chain_records (
      id TEXT PRIMARY KEY,
      artifactId TEXT NOT NULL,
      contentHash TEXT NOT NULL,
      ipfsCid TEXT,
      chain TEXT NOT NULL,
      txHash TEXT NOT NULL UNIQUE,
      blockNumber INTEGER,
      publishedBy TEXT,
      previousVersionTx TEXT,
      publishedAt TEXT NOT NULL,
      FOREIGN KEY (artifactId) REFERENCES artifacts(id)
    );

    CREATE TABLE IF NOT EXISTS validators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      expertise TEXT,           -- JSON array
      reputation REAL NOT NULL DEFAULT 0,
      validationCount INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      claimId TEXT NOT NULL,
      challengerId TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      FOREIGN KEY (claimId) REFERENCES claims(id),
      FOREIGN KEY (challengerId) REFERENCES validators(id)
    );

    CREATE TABLE IF NOT EXISTS endorsements (
      id TEXT PRIMARY KEY,
      claimId TEXT NOT NULL,
      validatorId TEXT NOT NULL,
      comment TEXT,
      weight REAL NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (claimId) REFERENCES claims(id),
      FOREIGN KEY (validatorId) REFERENCES validators(id)
    );

    CREATE TABLE IF NOT EXISTS artifact_revisions (
      id TEXT PRIMARY KEY,
      artifactId TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,    -- Full JSON snapshot of the artifact
      changedBy TEXT,
      changeNote TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (artifactId) REFERENCES artifacts(id)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'contributor', 'agent')),
      createdAt TEXT NOT NULL,
      revokedAt TEXT
    );
  `);
}

