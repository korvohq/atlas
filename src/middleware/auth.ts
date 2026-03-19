/**
 * API Key authentication middleware.
 *
 * - GET requests are always public (no auth required)
 * - POST / PATCH / DELETE require a valid API key via Authorization header
 * - Admin-only routes can use requireRole('admin')
 */

import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/database';

type Row = Record<string, any>;

export interface ApiKeyInfo {
  id: string;
  name: string;
  role: 'admin' | 'contributor' | 'agent';
}

// Extend Express Request to include apiKey info
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyInfo;
    }
  }
}

/**
 * Global auth middleware.
 * Skips auth for GET/HEAD/OPTIONS requests (public reads).
 * Requires valid Bearer token for all write operations.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  const authHeader = req.headers.authorization;

  // No auth header present
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Reads are public — let them through without auth
    if (isRead) return next();
    res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer <api-key>' });
    return;
  }

  const key = authHeader.slice(7).trim();
  if (!key) {
    if (isRead) return next();
    res.status(401).json({ error: 'API key is empty.' });
    return;
  }

  const row = getDb()
    .prepare('SELECT id, key, name, role, revokedAt FROM api_keys WHERE key = ?')
    .get(key) as Row | undefined;

  if (!row) {
    if (isRead) return next();
    res.status(401).json({ error: 'Invalid API key.' });
    return;
  }

  if (row.revokedAt) {
    if (isRead) return next();
    res.status(403).json({ error: 'This API key has been revoked.' });
    return;
  }

  // Set apiKey on request — available for both reads and writes
  req.apiKey = { id: row.id, name: row.name, role: row.role };
  next();
}

/**
 * Role-gated middleware factory.
 * Use after requireAuth to restrict endpoints to specific roles.
 *
 * Example: router.post('/', requireRole('admin'), handler)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!roles.includes(req.apiKey.role)) {
      res.status(403).json({ error: `Requires one of roles: ${roles.join(', ')}. You have: ${req.apiKey.role}` });
      return;
    }

    next();
  };
}

