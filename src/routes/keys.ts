/**
 * API key management routes — admin-only key provisioning.
 *
 * POST   /api/keys          — Create a new API key (admin only)
 * GET    /api/keys          — List all keys (admin only, keys are masked)
 * DELETE /api/keys/:id      — Revoke a key (admin only)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { getDb } from '../db/database';
import { requireRole } from '../middleware/auth';

type Row = Record<string, any>;

const router = Router();

/**
 * Generate a secure API key.
 * Format: atl_{random_hex} — easy to identify as an Atlas key.
 */
function generateKey(): string {
  return 'atl_' + crypto.randomBytes(24).toString('hex');
}

/** Mask a key for display: show first 8 chars, mask the rest */
function maskKey(key: string): string {
  return key.slice(0, 8) + '••••••••' + key.slice(-4);
}

router.get('/', requireRole('admin'), (_req: Request, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM api_keys ORDER BY createdAt DESC').all() as Row[];
  const masked = rows.map((r) => ({ ...r, key: maskKey(r.key) }));
  res.json(masked);
});

router.post('/', requireRole('admin'), (req: Request, res: Response) => {
  const { name, role } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required (string).' });
  }

  const validRoles = ['admin', 'contributor', 'agent'];
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  const now = new Date().toISOString();
  const apiKey = {
    id: uuid(),
    key: generateKey(),
    name,
    role,
    createdAt: now,
    revokedAt: null,
  };

  getDb().prepare(`
    INSERT INTO api_keys (id, key, name, role, createdAt, revokedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(apiKey.id, apiKey.key, apiKey.name, apiKey.role, apiKey.createdAt, null);

  // Return the full key ONCE — it can't be retrieved again
  res.status(201).json({
    ...apiKey,
    _notice: 'Save this key now. It will not be shown again in full.',
  });
});

router.delete('/:id', requireRole('admin'), (req: Request, res: Response) => {
  const id = req.params.id as string;
  const existing = getDb().prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as Row | undefined;
  if (!existing) return res.status(404).json({ error: 'API key not found.' });
  if (existing.revokedAt) return res.status(409).json({ error: 'Key is already revoked.' });

  const now = new Date().toISOString();
  getDb().prepare('UPDATE api_keys SET revokedAt = ? WHERE id = ?').run(now, id);
  res.json({ message: 'API key revoked.', id, revokedAt: now });
});

export default router;

