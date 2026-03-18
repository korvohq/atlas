import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { validateQuestion } from '../validation';

type Row = Record<string, any>;

const router = Router();

// List all questions
router.get('/', (_req: Request, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM questions ORDER BY createdAt DESC').all() as Row[];
  const questions = rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
  res.json(questions);
});

// Get a single question
router.get('/:id', (req: Request, res: Response) => {
  const row = getDb().prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Question not found' });
  res.json({ ...row, tags: JSON.parse(row.tags || '[]') });
});

// Create a question
router.post('/', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const question: Row = {
    id: uuid(),
    ...req.body,
    status: req.body.status || 'open',
    createdAt: now,
    updatedAt: now,
  };

  const valid = validateQuestion(question);
  if (!valid) return res.status(400).json({ errors: validateQuestion.errors });

  getDb().prepare(`
    INSERT INTO questions (id, text, context, tags, status, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    question.id, question.text, question.context || null,
    JSON.stringify(question.tags || []), question.status,
    question.createdBy || null, question.createdAt, question.updatedAt
  );

  res.status(201).json(question);
});

// Update a question
router.patch('/:id', (req: Request, res: Response) => {
  const existing: any = getDb().prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Question not found' });

  const updated: Row = {
    ...existing,
    tags: JSON.parse(existing.tags || '[]'),
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const valid = validateQuestion(updated);
  if (!valid) return res.status(400).json({ errors: validateQuestion.errors });

  getDb().prepare(`
    UPDATE questions SET text = ?, context = ?, tags = ?, status = ?, createdBy = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.text, updated.context || null,
    JSON.stringify(updated.tags || []), updated.status,
    updated.createdBy || null, updated.updatedAt, updated.id
  );

  res.json(updated);
});

// Delete a question
router.delete('/:id', (req: Request, res: Response) => {
  const result = getDb().prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Question not found' });
  res.status(204).send();
});

export default router;

