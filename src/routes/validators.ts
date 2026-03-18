import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { validateValidator } from '../validation';

type Row = Record<string, any>;

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM validators ORDER BY reputation DESC').all() as Row[];
  const validators = rows.map((r) => ({ ...r, expertise: JSON.parse(r.expertise || '[]') }));
  res.json(validators);
});

router.get('/:id', (req: Request, res: Response) => {
  const row = getDb().prepare('SELECT * FROM validators WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Validator not found' });
  res.json({ ...row, expertise: JSON.parse(row.expertise || '[]') });
});

router.post('/', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const validator: Row = {
    id: uuid(),
    ...req.body,
    reputation: req.body.reputation ?? 0,
    validationCount: req.body.validationCount ?? 0,
    createdAt: now,
    updatedAt: now,
  };

  const valid = validateValidator(validator);
  if (!valid) return res.status(400).json({ errors: validateValidator.errors });

  getDb().prepare(`
    INSERT INTO validators (id, name, type, expertise, reputation, validationCount, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    validator.id, validator.name, validator.type,
    JSON.stringify(validator.expertise || []),
    validator.reputation, validator.validationCount,
    validator.createdAt, validator.updatedAt
  );

  res.status(201).json(validator);
});

router.patch('/:id', (req: Request, res: Response) => {
  const existing: any = getDb().prepare('SELECT * FROM validators WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Validator not found' });

  const updated: Row = {
    ...existing,
    expertise: JSON.parse(existing.expertise || '[]'),
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const valid = validateValidator(updated);
  if (!valid) return res.status(400).json({ errors: validateValidator.errors });

  getDb().prepare(`
    UPDATE validators SET name = ?, type = ?, expertise = ?, reputation = ?, validationCount = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.name, updated.type,
    JSON.stringify(updated.expertise || []),
    updated.reputation, updated.validationCount,
    updated.updatedAt, updated.id
  );

  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = getDb().prepare('DELETE FROM validators WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Validator not found' });
  res.status(204).send();
});

export default router;

