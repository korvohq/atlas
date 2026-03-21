import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, syncClaimSources } from '../db/database';
import { validateClaim } from '../validation';

type Row = Record<string, any>;

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const status = req.query.status as string;
  const confidence = req.query.confidence as string;
  const q = req.query.q as string;

  let query = 'SELECT * FROM claims';
  const conditions: string[] = [];
  const params: any[] = [];

  if (status) { conditions.push('status = ?'); params.push(status); }
  if (confidence) { conditions.push('confidence = ?'); params.push(confidence); }

  if (q) {
    const ftsIds = getDb().prepare("SELECT id FROM claims_fts WHERE claims_fts MATCH ? LIMIT ?").all(q, limit) as Row[];
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

  const rows = getDb().prepare(query).all(...params) as Row[];
  const claims = rows.map((r) => ({
    ...r,
    sourceIds: JSON.parse(r.sourceIds || '[]'),
    tags: JSON.parse(r.tags || '[]'),
  }));

  const total = (getDb().prepare('SELECT COUNT(*) as total FROM claims').get() as Row).total;

  res.json({ data: claims, total, limit, offset });
});

router.get('/:id', (req: Request, res: Response) => {
  const row = getDb().prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Claim not found' });
  res.json({
    ...row,
    sourceIds: JSON.parse(row.sourceIds || '[]'),
    tags: JSON.parse(row.tags || '[]'),
  });
});

router.post('/', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const claim: Row = {
    id: uuid(),
    ...req.body,
    status: req.body.status || 'draft',
    createdAt: now,
    updatedAt: now,
  };

  const valid = validateClaim(claim);
  if (!valid) return res.status(400).json({ errors: validateClaim.errors });

  getDb().prepare(`
    INSERT INTO claims (id, statement, confidence, sourceIds, questionId, status, tags, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    claim.id, claim.statement, claim.confidence,
    JSON.stringify(claim.sourceIds), claim.questionId || null,
    claim.status, JSON.stringify(claim.tags || []),
    claim.createdBy || null, claim.createdAt, claim.updatedAt
  );

  // Sync junction table
  syncClaimSources(claim.id, claim.sourceIds);

  res.status(201).json(claim);
});

router.patch('/:id', (req: Request, res: Response) => {
  const existing: any = getDb().prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Claim not found' });

  const updated: Row = {
    ...existing,
    sourceIds: JSON.parse(existing.sourceIds || '[]'),
    tags: JSON.parse(existing.tags || '[]'),
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const valid = validateClaim(updated);
  if (!valid) return res.status(400).json({ errors: validateClaim.errors });

  getDb().prepare(`
    UPDATE claims SET statement = ?, confidence = ?, sourceIds = ?, questionId = ?, status = ?, tags = ?, createdBy = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.statement, updated.confidence,
    JSON.stringify(updated.sourceIds), updated.questionId || null,
    updated.status, JSON.stringify(updated.tags || []),
    updated.createdBy || null, updated.updatedAt, updated.id
  );

  // Sync junction table
  syncClaimSources(updated.id, updated.sourceIds);

  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = getDb().prepare('DELETE FROM claims WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Claim not found' });
  res.status(204).send();
});

export default router;

