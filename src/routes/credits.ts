/**
 * Credits routes — manage publish credits (the "gas" of Atlas).
 *
 * GET    /api/credits              — Check your credit balance
 * GET    /api/credits/pricing      — See publish pricing tiers
 * POST   /api/credits/purchase     — Buy credits (admin/test — real payment via Stripe later)
 * GET    /api/credits/transactions — View credit transaction history
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { PRICING, getCredits, addCredits } from '../chain/pricing';

type Row = Record<string, any>;

const router = Router();

/**
 * GET /api/credits/pricing
 * Public — show all pricing tiers.
 */
router.get('/pricing', (_req: Request, res: Response) => {
  res.json({
    message: 'Publishing to the Atlas blockchain costs credits. Reads and verification are always free.',
    tiers: Object.values(PRICING),
    note: '1 credit = 1 blockchain-anchored artifact publish',
  });
});

/**
 * GET /api/credits
 * Show credit balance for the authenticated API key.
 */
router.get('/', (req: Request, res: Response) => {
  if (!req.apiKey) {
    return res.status(401).json({ error: 'API key required to check credit balance.' });
  }

  const credits = getCredits(getDb(), req.apiKey.id);
  res.json({
    apiKeyId: req.apiKey.id,
    name: req.apiKey.name,
    credits,
    publishesRemaining: credits,
  });
});

/**
 * POST /api/credits/purchase
 * Add credits to the authenticated API key.
 *
 * In production, this would be called AFTER a successful Stripe/crypto payment.
 * For now, it's a direct admin/test endpoint.
 */
router.post('/purchase', (req: Request, res: Response) => {
  if (!req.apiKey) {
    return res.status(401).json({ error: 'API key required.' });
  }

  const { tier } = req.body;

  if (!tier || !PRICING[tier]) {
    return res.status(400).json({
      error: `Invalid tier. Choose one of: ${Object.keys(PRICING).join(', ')}`,
      tiers: Object.values(PRICING),
    });
  }

  const plan = PRICING[tier];
  const db = getDb();

  addCredits(db, req.apiKey.id, plan.credits, `Purchased: ${plan.name} ($${plan.priceUsd})`);

  const newBalance = getCredits(db, req.apiKey.id);

  res.status(201).json({
    message: `Added ${plan.credits} credits (${plan.name})`,
    purchased: plan.credits,
    priceUsd: plan.priceUsd,
    newBalance,
    _note: 'In production, this endpoint is called after Stripe/crypto payment confirmation.',
  });
});

/**
 * GET /api/credits/transactions
 * View credit transaction history for the authenticated API key.
 */
router.get('/transactions', (req: Request, res: Response) => {
  if (!req.apiKey) {
    return res.status(401).json({ error: 'API key required.' });
  }

  const rows = getDb()
    .prepare('SELECT * FROM credit_transactions WHERE apiKeyId = ? ORDER BY createdAt DESC LIMIT 100')
    .all(req.apiKey.id) as Row[];

  const balance = getCredits(getDb(), req.apiKey.id);

  res.json({
    balance,
    transactions: rows,
  });
});

export default router;

