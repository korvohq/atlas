import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { validateArtifact } from '../validation';

type Row = Record<string, any>;

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM artifacts ORDER BY createdAt DESC').all() as Row[];
  const artifacts = rows.map((r) => ({
    ...r,
    claimIds: JSON.parse(r.claimIds || '[]'),
    sourceIds: JSON.parse(r.sourceIds || '[]'),
    tags: JSON.parse(r.tags || '[]'),
  }));
  res.json(artifacts);
});

router.get('/:id', (req: Request, res: Response) => {
  const row = getDb().prepare('SELECT * FROM artifacts WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Artifact not found' });
  res.json({
    ...row,
    claimIds: JSON.parse(row.claimIds || '[]'),
    sourceIds: JSON.parse(row.sourceIds || '[]'),
    tags: JSON.parse(row.tags || '[]'),
  });
});

router.post('/', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const artifact: Row = {
    id: uuid(),
    ...req.body,
    status: req.body.status || 'draft',
    createdAt: now,
    updatedAt: now,
  };

  const valid = validateArtifact(artifact);
  if (!valid) return res.status(400).json({ errors: validateArtifact.errors });

  getDb().prepare(`
    INSERT INTO artifacts (id, title, type, body, summary, questionId, claimIds, sourceIds, status, tags, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artifact.id, artifact.title, artifact.type, artifact.body,
    artifact.summary || null, artifact.questionId || null,
    JSON.stringify(artifact.claimIds), JSON.stringify(artifact.sourceIds),
    artifact.status, JSON.stringify(artifact.tags || []),
    artifact.createdBy || null, artifact.createdAt, artifact.updatedAt
  );

  res.status(201).json(artifact);
});

router.patch('/:id', (req: Request, res: Response) => {
  const existing: any = getDb().prepare('SELECT * FROM artifacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Artifact not found' });

  const updated: Row = {
    ...existing,
    claimIds: JSON.parse(existing.claimIds || '[]'),
    sourceIds: JSON.parse(existing.sourceIds || '[]'),
    tags: JSON.parse(existing.tags || '[]'),
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const valid = validateArtifact(updated);
  if (!valid) return res.status(400).json({ errors: validateArtifact.errors });

  getDb().prepare(`
    UPDATE artifacts SET title = ?, type = ?, body = ?, summary = ?, questionId = ?, claimIds = ?, sourceIds = ?, status = ?, tags = ?, createdBy = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.title, updated.type, updated.body,
    updated.summary || null, updated.questionId || null,
    JSON.stringify(updated.claimIds), JSON.stringify(updated.sourceIds),
    updated.status, JSON.stringify(updated.tags || []),
    updated.createdBy || null, updated.updatedAt, updated.id
  );

  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = getDb().prepare('DELETE FROM artifacts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Artifact not found' });
  res.status(204).send();
});

export default router;

