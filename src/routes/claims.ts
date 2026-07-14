import { Router, Request, Response } from 'express';
import { RouteDependencies } from '../app-dependencies';
import { syncClaimSources } from '../db/database';
import { validateClaim } from '../validation';

type Row = Record<string, any>;

export function createClaimsRouter({ db, now, generateId }: RouteDependencies): Router {
const router = Router();

router.get('/', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const status = req.query.status as string;
  const confidence = req.query.confidence as string;
  const origin = req.query.origin as string;
  const reviewStatus = req.query.reviewStatus as string;
  const q = req.query.q as string;

  let query = 'SELECT * FROM claims';
  const conditions: string[] = [];
  const params: any[] = [];

  if (status) { conditions.push('status = ?'); params.push(status); }
  if (confidence) { conditions.push('confidence = ?'); params.push(confidence); }
  if (origin) { conditions.push('origin = ?'); params.push(origin); }
  if (reviewStatus) { conditions.push('reviewStatus = ?'); params.push(reviewStatus); }

  if (q) {
    const ftsIds = db.prepare("SELECT id FROM claims_fts WHERE claims_fts MATCH ? LIMIT ?").all(q, limit) as Row[];
    if (ftsIds.length > 0) {
      conditions.push(`id IN (${ftsIds.map(() => '?').join(',')})`);
      params.push(...ftsIds.map(r => r.id));
    } else {
      return res.json({ data: [], total: 0, limit, offset });
    }
  }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params) as Row[];
  const claims = rows.map((r) => ({
    ...r,
    sourceIds: JSON.parse(r.sourceIds || '[]'),
    tags: JSON.parse(r.tags || '[]'),
    extractionMeta: r.extractionMeta ? JSON.parse(r.extractionMeta) : null,
  }));

  const total = (db.prepare('SELECT COUNT(*) as total FROM claims').get() as Row).total;

  res.json({ data: claims, total, limit, offset });
});

router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Claim not found' });
  res.json({
    ...row,
    sourceIds: JSON.parse(row.sourceIds || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    extractionMeta: row.extractionMeta ? JSON.parse(row.extractionMeta) : null,
  });
});

router.post('/', (req: Request, res: Response) => {
  const timestamp = now().toISOString();
  const claim: Row = {
    id: generateId(),
    ...req.body,
    status: req.body.status || 'draft',
    origin: req.body.origin || 'human',
    reviewStatus: req.body.reviewStatus || 'unreviewed',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const valid = validateClaim(claim);
  if (!valid) return res.status(400).json({ errors: validateClaim.errors });

  db.prepare(`
    INSERT INTO claims (id, statement, confidence, sourceIds, questionId, status, tags, origin, reviewStatus, extractionMeta, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    claim.id, claim.statement, claim.confidence,
    JSON.stringify(claim.sourceIds), claim.questionId || null,
    claim.status, JSON.stringify(claim.tags || []),
    claim.origin, claim.reviewStatus,
    claim.extractionMeta ? JSON.stringify(claim.extractionMeta) : null,
    claim.createdBy || null, claim.createdAt, claim.updatedAt
  );

  // Sync junction table
  syncClaimSources(claim.id, claim.sourceIds, db);

  res.status(201).json(claim);
});

router.patch('/:id', (req: Request, res: Response) => {
  const existing: any = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Claim not found' });

  const updated: Row = {
    ...existing,
    sourceIds: JSON.parse(existing.sourceIds || '[]'),
    tags: JSON.parse(existing.tags || '[]'),
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now().toISOString(),
  };

  const valid = validateClaim(updated);
  if (!valid) return res.status(400).json({ errors: validateClaim.errors });

  db.prepare(`
    UPDATE claims SET statement = ?, confidence = ?, sourceIds = ?, questionId = ?, status = ?, tags = ?, origin = ?, reviewStatus = ?, extractionMeta = ?, createdBy = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.statement, updated.confidence,
    JSON.stringify(updated.sourceIds), updated.questionId || null,
    updated.status, JSON.stringify(updated.tags || []),
    updated.origin || 'human', updated.reviewStatus || 'unreviewed',
    updated.extractionMeta ? JSON.stringify(updated.extractionMeta) : null,
    updated.createdBy || null, updated.updatedAt, updated.id
  );

  // Sync junction table
  syncClaimSources(updated.id, updated.sourceIds, db);

  res.json(updated);
});

/**
 * PATCH /api/v1/claims/:id/review — Human triage endpoint for AI-extracted claims.
 * Accepts { reviewStatus, reviewedBy? } to mark a claim as verified or rejected.
 */
router.patch('/:id/review', (req: Request, res: Response) => {
  const { reviewStatus, reviewedBy } = req.body;
  const validStatuses = ['unreviewed', 'human_verified', 'human_rejected'];

  if (!reviewStatus || !validStatuses.includes(reviewStatus)) {
    return res.status(400).json({
      error: `reviewStatus is required and must be one of: ${validStatuses.join(', ')}`,
    });
  }

  const existing = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!existing) return res.status(404).json({ error: 'Claim not found' });

  const timestamp = now().toISOString();
  db.prepare('UPDATE claims SET reviewStatus = ?, updatedAt = ? WHERE id = ?')
    .run(reviewStatus, timestamp, req.params.id);

  res.json({
    id: existing.id,
    reviewStatus,
    reviewedBy: reviewedBy || req.apiKey?.name || null,
    updatedAt: timestamp,
  });
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM claims WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Claim not found' });
  res.status(204).send();
});

return router;
}

