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
      tags TEXT,            -- JSON array (kept for backward compat, tags table preferred)
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
      sourceIds TEXT NOT NULL,   -- JSON array (kept for backward compat)
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
      claimIds TEXT NOT NULL,    -- JSON array (kept for backward compat)
      sourceIds TEXT NOT NULL,   -- JSON array (kept for backward compat)
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
      resolvedBy TEXT,
      resolutionNote TEXT,
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

    CREATE TABLE IF NOT EXISTS publish_credits (
      apiKeyId TEXT PRIMARY KEY,
      credits INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT,
      FOREIGN KEY (apiKeyId) REFERENCES api_keys(id)
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      apiKeyId TEXT NOT NULL,
      amount INTEGER NOT NULL,        -- positive = purchase, negative = spend
      type TEXT NOT NULL,              -- 'purchase', 'publish', 'grant', 'refund'
      description TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (apiKeyId) REFERENCES api_keys(id)
    );

    -- ═══════════════════════════════════════════════════════════
    -- Junction tables (proper many-to-many relationships)
    -- ═══════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS claim_sources (
      claimId TEXT NOT NULL,
      sourceId TEXT NOT NULL,
      PRIMARY KEY (claimId, sourceId),
      FOREIGN KEY (claimId) REFERENCES claims(id) ON DELETE CASCADE,
      FOREIGN KEY (sourceId) REFERENCES sources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifact_claims (
      artifactId TEXT NOT NULL,
      claimId TEXT NOT NULL,
      PRIMARY KEY (artifactId, claimId),
      FOREIGN KEY (artifactId) REFERENCES artifacts(id) ON DELETE CASCADE,
      FOREIGN KEY (claimId) REFERENCES claims(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifact_sources (
      artifactId TEXT NOT NULL,
      sourceId TEXT NOT NULL,
      PRIMARY KEY (artifactId, sourceId),
      FOREIGN KEY (artifactId) REFERENCES artifacts(id) ON DELETE CASCADE,
      FOREIGN KEY (sourceId) REFERENCES sources(id) ON DELETE CASCADE
    );

    -- ═══════════════════════════════════════════════════════════
    -- Indexes (query performance on foreign keys & common lookups)
    -- ═══════════════════════════════════════════════════════════

    CREATE INDEX IF NOT EXISTS idx_claims_questionId ON claims(questionId);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
    CREATE INDEX IF NOT EXISTS idx_claims_confidence ON claims(confidence);
    CREATE INDEX IF NOT EXISTS idx_claims_createdAt ON claims(createdAt);

    CREATE INDEX IF NOT EXISTS idx_artifacts_questionId ON artifacts(questionId);
    CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
    CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
    CREATE INDEX IF NOT EXISTS idx_artifacts_createdAt ON artifacts(createdAt);
    CREATE INDEX IF NOT EXISTS idx_artifacts_txHash ON artifacts(txHash);

    CREATE INDEX IF NOT EXISTS idx_chain_records_artifactId ON chain_records(artifactId);
    CREATE INDEX IF NOT EXISTS idx_chain_records_chain ON chain_records(chain);

    CREATE INDEX IF NOT EXISTS idx_challenges_claimId ON challenges(claimId);
    CREATE INDEX IF NOT EXISTS idx_challenges_challengerId ON challenges(challengerId);
    CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);

    CREATE INDEX IF NOT EXISTS idx_endorsements_claimId ON endorsements(claimId);
    CREATE INDEX IF NOT EXISTS idx_endorsements_validatorId ON endorsements(validatorId);

    CREATE INDEX IF NOT EXISTS idx_artifact_revisions_artifactId ON artifact_revisions(artifactId);

    CREATE INDEX IF NOT EXISTS idx_credit_transactions_apiKeyId ON credit_transactions(apiKeyId);

    CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
    CREATE INDEX IF NOT EXISTS idx_sources_createdAt ON sources(createdAt);

    CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
    CREATE INDEX IF NOT EXISTS idx_questions_createdAt ON questions(createdAt);

    CREATE INDEX IF NOT EXISTS idx_validators_type ON validators(type);
    CREATE INDEX IF NOT EXISTS idx_validators_reputation ON validators(reputation);
  `);

  // ═══════════════════════════════════════════════════════════
  // Full-Text Search (FTS5)
  // ═══════════════════════════════════════════════════════════

  conn.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS claims_fts USING fts5(
      id UNINDEXED, statement, tags, content='claims', content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
      id UNINDEXED, title, body, summary, tags, content='artifacts', content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(
      id UNINDEXED, title, author, tags, content='sources', content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(
      id UNINDEXED, text, context, tags, content='questions', content_rowid='rowid'
    );
  `);

  // Triggers to keep FTS in sync with base tables
  conn.exec(`
    CREATE TRIGGER IF NOT EXISTS claims_ai AFTER INSERT ON claims BEGIN
      INSERT INTO claims_fts(rowid, id, statement, tags)
      VALUES (new.rowid, new.id, new.statement, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS claims_ad AFTER DELETE ON claims BEGIN
      INSERT INTO claims_fts(claims_fts, rowid, id, statement, tags)
      VALUES ('delete', old.rowid, old.id, old.statement, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS claims_au AFTER UPDATE ON claims BEGIN
      INSERT INTO claims_fts(claims_fts, rowid, id, statement, tags)
      VALUES ('delete', old.rowid, old.id, old.statement, old.tags);
      INSERT INTO claims_fts(rowid, id, statement, tags)
      VALUES (new.rowid, new.id, new.statement, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS artifacts_ai AFTER INSERT ON artifacts BEGIN
      INSERT INTO artifacts_fts(rowid, id, title, body, summary, tags)
      VALUES (new.rowid, new.id, new.title, new.body, new.summary, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS artifacts_ad AFTER DELETE ON artifacts BEGIN
      INSERT INTO artifacts_fts(artifacts_fts, rowid, id, title, body, summary, tags)
      VALUES ('delete', old.rowid, old.id, old.title, old.body, old.summary, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS artifacts_au AFTER UPDATE ON artifacts BEGIN
      INSERT INTO artifacts_fts(artifacts_fts, rowid, id, title, body, summary, tags)
      VALUES ('delete', old.rowid, old.id, old.title, old.body, old.summary, old.tags);
      INSERT INTO artifacts_fts(rowid, id, title, body, summary, tags)
      VALUES (new.rowid, new.id, new.title, new.body, new.summary, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS sources_ai AFTER INSERT ON sources BEGIN
      INSERT INTO sources_fts(rowid, id, title, author, tags)
      VALUES (new.rowid, new.id, new.title, new.author, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS sources_ad AFTER DELETE ON sources BEGIN
      INSERT INTO sources_fts(sources_fts, rowid, id, title, author, tags)
      VALUES ('delete', old.rowid, old.id, old.title, old.author, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS sources_au AFTER UPDATE ON sources BEGIN
      INSERT INTO sources_fts(sources_fts, rowid, id, title, author, tags)
      VALUES ('delete', old.rowid, old.id, old.title, old.author, old.tags);
      INSERT INTO sources_fts(rowid, id, title, author, tags)
      VALUES (new.rowid, new.id, new.title, new.author, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS questions_ai AFTER INSERT ON questions BEGIN
      INSERT INTO questions_fts(rowid, id, text, context, tags)
      VALUES (new.rowid, new.id, new.text, new.context, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS questions_ad AFTER DELETE ON questions BEGIN
      INSERT INTO questions_fts(questions_fts, rowid, id, text, context, tags)
      VALUES ('delete', old.rowid, old.id, old.text, old.context, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS questions_au AFTER UPDATE ON questions BEGIN
      INSERT INTO questions_fts(questions_fts, rowid, id, text, context, tags)
      VALUES ('delete', old.rowid, old.id, old.text, old.context, old.tags);
      INSERT INTO questions_fts(rowid, id, text, context, tags)
      VALUES (new.rowid, new.id, new.text, new.context, new.tags);
    END;
  `);
}

/**
 * Sync junction tables from JSON array columns.
 * Call after inserting/updating a claim or artifact to keep junction tables populated.
 */
export function syncClaimSources(claimId: string, sourceIds: string[]): void {
  const conn = getDb();
  conn.prepare('DELETE FROM claim_sources WHERE claimId = ?').run(claimId);
  const insert = conn.prepare('INSERT OR IGNORE INTO claim_sources (claimId, sourceId) VALUES (?, ?)');
  for (const sid of sourceIds) {
    insert.run(claimId, sid);
  }
}

export function syncArtifactRelations(artifactId: string, claimIds: string[], sourceIds: string[]): void {
  const conn = getDb();
  conn.prepare('DELETE FROM artifact_claims WHERE artifactId = ?').run(artifactId);
  conn.prepare('DELETE FROM artifact_sources WHERE artifactId = ?').run(artifactId);
  const insertClaim = conn.prepare('INSERT OR IGNORE INTO artifact_claims (artifactId, claimId) VALUES (?, ?)');
  const insertSource = conn.prepare('INSERT OR IGNORE INTO artifact_sources (artifactId, sourceId) VALUES (?, ?)');
  for (const cid of claimIds) {
    insertClaim.run(artifactId, cid);
  }
  for (const sid of sourceIds) {
    insertSource.run(artifactId, sid);
  }
}
