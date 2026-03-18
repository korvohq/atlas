import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { validateClaim } from '../validation';

type Row = Record<string, any>;

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM claims ORDER BY createdAt DESC').all() as Row[];
  const claims = rows.map((r) => ({
    ...r,
    sourceIds: JSON.parse(r.sourceIds || '[]'),
    tags: JSON.parse(r.tags || '[]'),
  }));
  res.json(claims);
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

  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = getDb().prepare('DELETE FROM claims WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Claim not found' });
  res.status(204).send();
});

export default router;

