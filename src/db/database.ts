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
      FOREIGN KEY (questionId) REFERENCES questions(id)
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
  `);
}

