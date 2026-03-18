import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { validateSource } from '../validation';

type Row = Record<string, any>;

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM sources ORDER BY createdAt DESC').all() as Row[];
  const sources = rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
  res.json(sources);
});

router.get('/:id', (req: Request, res: Response) => {
  const row = getDb().prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Source not found' });
  res.json({ ...row, tags: JSON.parse(row.tags || '[]') });
});

router.post('/', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const source: Row = {
    id: uuid(),
    ...req.body,
    createdAt: now,
    updatedAt: now,
  };

  const valid = validateSource(source);
  if (!valid) return res.status(400).json({ errors: validateSource.errors });

  getDb().prepare(`
    INSERT INTO sources (id, type, title, url, author, publishedAt, retrievedAt, contentHash, tags, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    source.id, source.type, source.title, source.url || null,
    source.author || null, source.publishedAt || null, source.retrievedAt || null,
    source.contentHash || null, JSON.stringify(source.tags || []),
    source.createdBy || null, source.createdAt, source.updatedAt
  );

  res.status(201).json(source);
});

router.patch('/:id', (req: Request, res: Response) => {
  const existing: any = getDb().prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Source not found' });

  const updated: Row = {
    ...existing,
    tags: JSON.parse(existing.tags || '[]'),
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const valid = validateSource(updated);
  if (!valid) return res.status(400).json({ errors: validateSource.errors });

  getDb().prepare(`
    UPDATE sources SET type = ?, title = ?, url = ?, author = ?, publishedAt = ?, retrievedAt = ?, contentHash = ?, tags = ?, createdBy = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.type, updated.title, updated.url || null,
    updated.author || null, updated.publishedAt || null, updated.retrievedAt || null,
    updated.contentHash || null, JSON.stringify(updated.tags || []),
    updated.createdBy || null, updated.updatedAt, updated.id
  );

  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = getDb().prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Source not found' });
  res.status(204).send();
});

export default router;

