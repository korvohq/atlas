/**
 * Search routes — full-text search across all research objects.
 *
 * GET /api/v1/search?q=...           — Search everything
 * GET /api/v1/search?q=...&type=claims — Search specific type
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

type Row = Record<string, any>;

const router = Router();

/**
 * GET /api/v1/search?q=<query>&type=<claims|artifacts|sources|questions>&limit=<n>
 *
 * Full-text search using SQLite FTS5 across all research objects.
 * Returns ranked results grouped by object type.
 */
router.get('/', (req: Request, res: Response) => {
  const q = req.query.q as string;
  const type = req.query.type as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query parameter "q" is required (min 2 characters).' });
  }

  const db = getDb();
  const results: Record<string, any[]> = {};

  const searchTypes = type ? [type] : ['claims', 'artifacts', 'sources', 'questions'];

  if (searchTypes.includes('claims')) {
    try {
      const rows = db.prepare(`
        SELECT c.* FROM claims_fts f
        JOIN claims c ON c.id = f.id
        WHERE claims_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(q, limit) as Row[];
      results.claims = rows.map(r => ({
        ...r,
        sourceIds: JSON.parse(r.sourceIds || '[]'),
        tags: JSON.parse(r.tags || '[]'),
      }));
    } catch { results.claims = []; }
  }

  if (searchTypes.includes('artifacts')) {
    try {
      const rows = db.prepare(`
        SELECT a.* FROM artifacts_fts f
        JOIN artifacts a ON a.id = f.id
        WHERE artifacts_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(q, limit) as Row[];
      results.artifacts = rows.map(r => ({
        ...r,
        claimIds: JSON.parse(r.claimIds || '[]'),
        sourceIds: JSON.parse(r.sourceIds || '[]'),
        tags: JSON.parse(r.tags || '[]'),
        onChain: !!r.txHash,
      }));
    } catch { results.artifacts = []; }
  }

  if (searchTypes.includes('sources')) {
    try {
      const rows = db.prepare(`
        SELECT s.* FROM sources_fts f
        JOIN sources s ON s.id = f.id
        WHERE sources_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(q, limit) as Row[];
      results.sources = rows.map(r => ({
        ...r,
        tags: JSON.parse(r.tags || '[]'),
      }));
    } catch { results.sources = []; }
  }

  if (searchTypes.includes('questions')) {
    try {
      const rows = db.prepare(`
        SELECT q2.* FROM questions_fts f
        JOIN questions q2 ON q2.id = f.id
        WHERE questions_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(q, limit) as Row[];
      results.questions = rows.map(r => ({
        ...r,
        tags: JSON.parse(r.tags || '[]'),
      }));
    } catch { results.questions = []; }
  }

  const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  res.json({
    query: q,
    totalResults,
    results,
  });
});

export default router;

