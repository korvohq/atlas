/**
 * Endorsement routes — validators endorse claims to build credibility.
 *
 * GET    /api/endorsements              — List all endorsements
 * POST   /api/endorsements              — Create an endorsement
 * GET    /api/endorsements/claim/:claimId — Get all endorsements for a claim
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { validateEndorsement } from '../validation';

type Row = Record<string, any>;

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM endorsements ORDER BY createdAt DESC').all() as Row[];
  res.json(rows);
});

router.get('/claim/:claimId', (req: Request, res: Response) => {
  const claimId = req.params.claimId as string;

  // Get endorsements for this claim
  const endorsements = getDb().prepare('SELECT * FROM endorsements WHERE claimId = ? ORDER BY createdAt DESC').all(claimId) as Row[];

  // Compute aggregate endorsement score
  const totalWeight = endorsements.reduce((sum: number, e: Row) => sum + (e.weight || 1), 0);
  const avgWeight = endorsements.length > 0 ? totalWeight / endorsements.length : 0;

  res.json({
    claimId,
    endorsements,
    summary: {
      count: endorsements.length,
      totalWeight: Math.round(totalWeight * 100) / 100,
      averageWeight: Math.round(avgWeight * 100) / 100,
    },
  });
});

router.post('/', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const endorsement: Row = {
    id: uuid(),
    ...req.body,
    createdAt: now,
  };

  const valid = validateEndorsement(endorsement);
  if (!valid) return res.status(400).json({ errors: validateEndorsement.errors });

  // Verify the claim exists
  const claim = getDb().prepare('SELECT id FROM claims WHERE id = ?').get(endorsement.claimId) as Row | undefined;
  if (!claim) return res.status(400).json({ error: `Claim not found: ${endorsement.claimId}` });

  // Verify the validator exists
  const validator = getDb().prepare('SELECT id FROM validators WHERE id = ?').get(endorsement.validatorId) as Row | undefined;
  if (!validator) return res.status(400).json({ error: `Validator not found: ${endorsement.validatorId}` });

  // Prevent self-endorsement — a validator cannot endorse claims they authored
  const claimRow = getDb().prepare('SELECT createdBy FROM claims WHERE id = ?').get(endorsement.claimId) as Row | undefined;
  if (claimRow && claimRow.createdBy === endorsement.validatorId) {
    return res.status(403).json({ error: 'Self-endorsement is not allowed. A validator cannot endorse their own claims.' });
  }

  // Prevent duplicate endorsement from same validator on same claim
  const existing = getDb().prepare('SELECT id FROM endorsements WHERE claimId = ? AND validatorId = ?').get(endorsement.claimId, endorsement.validatorId) as Row | undefined;
  if (existing) return res.status(409).json({ error: 'This validator has already endorsed this claim.' });

  const db = getDb();

  // Insert the endorsement
  db.prepare(`
    INSERT INTO endorsements (id, claimId, validatorId, comment, weight, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    endorsement.id, endorsement.claimId, endorsement.validatorId,
    endorsement.comment || null, endorsement.weight,
    endorsement.createdAt
  );

  // Increment validator's validation count
  db.prepare(`UPDATE validators SET validationCount = validationCount + 1, updatedAt = ? WHERE id = ?`).run(now, endorsement.validatorId);

  res.status(201).json(endorsement);
});

export default router;

