/**
 * Challenge routes — dispute claims with evidence.
 *
 * GET    /api/challenges              — List all challenges
 * POST   /api/challenges              — Create a challenge (auto-disputes the claim)
 * GET    /api/challenges/:id          — Get challenge by ID
 * PATCH  /api/challenges/:id          — Update challenge status
 * GET    /api/challenges/claim/:claimId — Get all challenges for a claim
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { validateChallenge } from '../validation';

type Row = Record<string, any>;

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM challenges ORDER BY createdAt DESC').all() as Row[];
  res.json(rows);
});

router.get('/claim/:claimId', (req: Request, res: Response) => {
  const claimId = req.params.claimId as string;
  const rows = getDb().prepare('SELECT * FROM challenges WHERE claimId = ? ORDER BY createdAt DESC').all(claimId) as Row[];
  res.json(rows);
});

router.get('/:id', (req: Request, res: Response) => {
  const row = getDb().prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id as string) as Row | undefined;
  if (!row) return res.status(404).json({ error: 'Challenge not found' });
  res.json(row);
});

router.post('/', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const challenge: Row = {
    id: uuid(),
    ...req.body,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };

  const valid = validateChallenge(challenge);
  if (!valid) return res.status(400).json({ errors: validateChallenge.errors });

  // Verify the claim exists
  const claim = getDb().prepare('SELECT id, status FROM claims WHERE id = ?').get(challenge.claimId) as Row | undefined;
  if (!claim) return res.status(400).json({ error: `Claim not found: ${challenge.claimId}` });

  // Verify the challenger (validator) exists
  const challenger = getDb().prepare('SELECT id FROM validators WHERE id = ?').get(challenge.challengerId) as Row | undefined;
  if (!challenger) return res.status(400).json({ error: `Validator not found: ${challenge.challengerId}` });

  const db = getDb();

  // Insert the challenge
  db.prepare(`
    INSERT INTO challenges (id, claimId, challengerId, reason, evidence, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    challenge.id, challenge.claimId, challenge.challengerId,
    challenge.reason, challenge.evidence || null,
    challenge.status, challenge.createdAt, challenge.updatedAt
  );

  // Auto-update the claim status to 'disputed'
  db.prepare(`UPDATE claims SET status = 'disputed', updatedAt = ? WHERE id = ?`).run(now, challenge.claimId);

  // Increment challenger's validation count
  db.prepare(`UPDATE validators SET validationCount = validationCount + 1, updatedAt = ? WHERE id = ?`).run(now, challenge.challengerId);

  res.status(201).json(challenge);
});

router.patch('/:id', (req: Request, res: Response) => {
  const existing = getDb().prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id as string) as Row | undefined;
  if (!existing) return res.status(404).json({ error: 'Challenge not found' });

  const now = new Date().toISOString();
  const updated: Row = {
    ...existing,
    ...req.body,
    id: existing.id,
    claimId: existing.claimId,
    challengerId: existing.challengerId,
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  const valid = validateChallenge(updated);
  if (!valid) return res.status(400).json({ errors: validateChallenge.errors });

  getDb().prepare(`
    UPDATE challenges SET reason = ?, evidence = ?, status = ?, updatedAt = ?
    WHERE id = ?
  `).run(updated.reason, updated.evidence || null, updated.status, updated.updatedAt, updated.id);

  res.json(updated);
});

export default router;

