import { Router, Request, Response } from 'express';
import { RouteDependencies } from '../app-dependencies';
import { validateSource } from '../validation';

type Row = Record<string, any>;

export function createSourcesRouter({ db, now, generateId }: RouteDependencies): Router {
const router = Router();

router.get('/', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const type = req.query.type as string;
  const origin = req.query.origin as string;
  const reviewStatus = req.query.reviewStatus as string;
  const q = req.query.q as string;

  let query = 'SELECT * FROM sources';
  const conditions: string[] = [];
  const params: any[] = [];

  if (type) { conditions.push('type = ?'); params.push(type); }
  if (origin) { conditions.push('origin = ?'); params.push(origin); }
  if (reviewStatus) { conditions.push('reviewStatus = ?'); params.push(reviewStatus); }

  if (q) {
    const ftsIds = db.prepare("SELECT id FROM sources_fts WHERE sources_fts MATCH ? LIMIT ?").all(q, limit) as Row[];
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
  const sources = rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
  const total = (db.prepare('SELECT COUNT(*) as total FROM sources').get() as Row).total;
  res.json({ data: sources, total, limit, offset });
});

router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Source not found' });
  res.json({ ...row, tags: JSON.parse(row.tags || '[]') });
});

router.post('/', (req: Request, res: Response) => {
  const timestamp = now().toISOString();
  const source: Row = {
    id: generateId(),
    ...req.body,
    origin: req.body.origin || 'human',
    reviewStatus: req.body.reviewStatus || 'unreviewed',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const valid = validateSource(source);
  if (!valid) return res.status(400).json({ errors: validateSource.errors });

  db.prepare(`
    INSERT INTO sources (id, type, title, url, author, publishedAt, retrievedAt, contentHash, tags, origin, reviewStatus, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    source.id, source.type, source.title, source.url || null,
    source.author || null, source.publishedAt || null, source.retrievedAt || null,
    source.contentHash || null, JSON.stringify(source.tags || []),
    source.origin, source.reviewStatus,
    source.createdBy || null, source.createdAt, source.updatedAt
  );

  res.status(201).json(source);
});

router.patch('/:id', (req: Request, res: Response) => {
  const existing: any = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Source not found' });

  const updated: Row = {
    ...existing,
    tags: JSON.parse(existing.tags || '[]'),
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now().toISOString(),
  };

  const valid = validateSource(updated);
  if (!valid) return res.status(400).json({ errors: validateSource.errors });

  db.prepare(`
    UPDATE sources SET type = ?, title = ?, url = ?, author = ?, publishedAt = ?, retrievedAt = ?, contentHash = ?, tags = ?, origin = ?, reviewStatus = ?, createdBy = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.type, updated.title, updated.url || null,
    updated.author || null, updated.publishedAt || null, updated.retrievedAt || null,
    updated.contentHash || null, JSON.stringify(updated.tags || []),
    updated.origin || 'human', updated.reviewStatus || 'unreviewed',
    updated.createdBy || null, updated.updatedAt, updated.id
  );

  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Source not found' });
  res.status(204).send();
});

return router;
}

