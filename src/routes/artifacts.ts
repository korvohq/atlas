import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, syncArtifactRelations } from '../db/database';
import { validateArtifact } from '../validation';

type Row = Record<string, any>;

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const status = req.query.status as string;
  const type = req.query.type as string;
  const q = req.query.q as string;

  let query = 'SELECT * FROM artifacts';
  const conditions: string[] = [];
  const params: any[] = [];

  if (status) { conditions.push('status = ?'); params.push(status); }
  if (type) { conditions.push('type = ?'); params.push(type); }

  if (q) {
    const ftsIds = getDb().prepare("SELECT id FROM artifacts_fts WHERE artifacts_fts MATCH ? LIMIT ?").all(q, limit) as Row[];
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
  const artifacts = rows.map((r) => ({
    ...r,
    claimIds: JSON.parse(r.claimIds || '[]'),
    sourceIds: JSON.parse(r.sourceIds || '[]'),
    tags: JSON.parse(r.tags || '[]'),
    onChain: !!r.txHash,
  }));

  const total = (getDb().prepare('SELECT COUNT(*) as total FROM artifacts').get() as Row).total;
  res.json({ data: artifacts, total, limit, offset });
});

router.get('/:id', (req: Request, res: Response) => {
  const row = getDb().prepare('SELECT * FROM artifacts WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Artifact not found' });
  res.json({
    ...row,
    claimIds: JSON.parse(row.claimIds || '[]'),
    sourceIds: JSON.parse(row.sourceIds || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    onChain: !!row.txHash,
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

  // Sync junction tables
  syncArtifactRelations(artifact.id, artifact.claimIds, artifact.sourceIds);

  res.status(201).json(artifact);
});

router.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing: any = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Artifact not found' });

  // ── Save revision snapshot before updating ──
  const lastVersion = db.prepare('SELECT MAX(version) as maxV FROM artifact_revisions WHERE artifactId = ?').get(existing.id) as any;
  const nextVersion = (lastVersion?.maxV || 0) + 1;
  const snapshot = {
    ...existing,
    claimIds: JSON.parse(existing.claimIds || '[]'),
    sourceIds: JSON.parse(existing.sourceIds || '[]'),
    tags: JSON.parse(existing.tags || '[]'),
  };

  db.prepare(`
    INSERT INTO artifact_revisions (id, artifactId, version, snapshot, changedBy, changeNote, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid(), existing.id, nextVersion, JSON.stringify(snapshot),
    req.body.changedBy || req.apiKey?.name || null,
    req.body.changeNote || null,
    new Date().toISOString()
  );

  // ── Apply the update (strip revision-only fields) ──
  const { changeNote, changedBy, ...artifactFields } = req.body;
  const updated: Row = {
    ...existing,
    claimIds: JSON.parse(existing.claimIds || '[]'),
    sourceIds: JSON.parse(existing.sourceIds || '[]'),
    tags: JSON.parse(existing.tags || '[]'),
    ...artifactFields,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  // Remove null chain fields — they're set by the publish workflow, not user PATCH
  const chainFields = ['contentHash', 'ipfsCid', 'txHash', 'chain', 'publishedToChainAt', 'previousVersionTx'];
  for (const f of chainFields) {
    if (updated[f] === null || updated[f] === undefined) delete updated[f];
  }

  const valid = validateArtifact(updated);
  if (!valid) return res.status(400).json({ errors: validateArtifact.errors });

  db.prepare(`
    UPDATE artifacts SET title = ?, type = ?, body = ?, summary = ?, questionId = ?, claimIds = ?, sourceIds = ?, status = ?, tags = ?, createdBy = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.title, updated.type, updated.body,
    updated.summary || null, updated.questionId || null,
    JSON.stringify(updated.claimIds), JSON.stringify(updated.sourceIds),
    updated.status, JSON.stringify(updated.tags || []),
    updated.createdBy || null, updated.updatedAt, updated.id
  );

  // Sync junction tables
  syncArtifactRelations(updated.id, updated.claimIds, updated.sourceIds);

  res.json({ ...updated, _revision: nextVersion });
});

/**
 * GET /api/artifacts/:id/history — full revision history for an artifact
 */
router.get('/:id/history', (req: Request, res: Response) => {
  const artifactId = req.params.id as string;
  const artifact = getDb().prepare('SELECT id, title FROM artifacts WHERE id = ?').get(artifactId) as Row | undefined;
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

  const revisions = getDb()
    .prepare('SELECT * FROM artifact_revisions WHERE artifactId = ? ORDER BY version DESC')
    .all(artifactId) as Row[];

  const parsed = revisions.map((r) => ({
    ...r,
    snapshot: JSON.parse(r.snapshot || '{}'),
  }));

  res.json({
    artifactId,
    title: artifact.title,
    totalRevisions: parsed.length,
    revisions: parsed,
  });
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = getDb().prepare('DELETE FROM artifacts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Artifact not found' });
  res.status(204).send();
});

export default router;

