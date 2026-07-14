import { Router, Request, Response } from 'express';
import { RouteDependencies } from '../app-dependencies';
import { validateValidator } from '../validation';

type Row = Record<string, any>;

export function createValidatorsRouter({ db, now, generateId }: RouteDependencies): Router {
const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM validators ORDER BY reputation DESC').all() as Row[];
  const validators = rows.map((r) => ({ ...r, expertise: JSON.parse(r.expertise || '[]') }));
  res.json(validators);
});

router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM validators WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Validator not found' });
  res.json({ ...row, expertise: JSON.parse(row.expertise || '[]') });
});

router.post('/', (req: Request, res: Response) => {
  const timestamp = now().toISOString();
  const validator: Row = {
    id: generateId(),
    ...req.body,
    reputation: req.body.reputation ?? 0,
    validationCount: req.body.validationCount ?? 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const valid = validateValidator(validator);
  if (!valid) return res.status(400).json({ errors: validateValidator.errors });

  db.prepare(`
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
  const existing: any = db.prepare('SELECT * FROM validators WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Validator not found' });

  const updated: Row = {
    ...existing,
    expertise: JSON.parse(existing.expertise || '[]'),
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now().toISOString(),
  };

  const valid = validateValidator(updated);
  if (!valid) return res.status(400).json({ errors: validateValidator.errors });

  db.prepare(`
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
  const result = db.prepare('DELETE FROM validators WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Validator not found' });
  res.status(204).send();
});

return router;
}

