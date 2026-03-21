/**
 * Publish & verify routes — blockchain operations for artifacts.
 *
 * Publishing costs 1 credit per artifact (like gas on Ethereum).
 * Reads and verification are always free.
 *
 * POST /api/publish/:artifactId         — publish (costs 1 credit)
 * GET  /api/publish/:artifactId/verify  — verify (free)
 * GET  /api/publish/:artifactId/bundle  — retrieve full bundle from storage (free)
 * GET  /api/publish/chain-records       — list records (free)
 * GET  /api/publish/ipfs/health         — IPFS node health check (free)
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { publishToChain, verifyArtifact } from '../chain';
import { getCredits, deductCredit } from '../chain/pricing';
import { IpfsStorageAdapter } from '../chain/ipfs-adapter';
import { LocalStorageAdapter } from '../chain/local-adapter';
import { config } from '../config';

type Row = Record<string, any>;

const router = Router();

/**
 * POST /api/publish/:artifactId
 * Publish a draft artifact to the blockchain.
 * Costs 1 publish credit. Admin keys bypass the credit check.
 */
router.post('/:artifactId', async (req: Request, res: Response) => {
  try {
    const artifactId = req.params.artifactId as string;
    const publishedBy = req.body.publishedBy || req.apiKey?.name || 'anonymous';

    // ── Credit check (admins bypass for dev/testing) ──
    if (req.apiKey && req.apiKey.role !== 'admin') {
      const credits = getCredits(getDb(), req.apiKey.id);
      if (credits <= 0) {
        return res.status(402).json({
          error: 'Insufficient publish credits.',
          credits: 0,
          message: 'Publishing to the blockchain costs 1 credit. Purchase credits at POST /api/credits/purchase.',
          pricing: 'See GET /api/credits/pricing for available tiers.',
        });
      }

      // Deduct the credit
      const success = deductCredit(getDb(), req.apiKey.id);
      if (!success) {
        return res.status(402).json({ error: 'Failed to deduct credit. Please try again.' });
      }
    }

    const result = await publishToChain(artifactId, publishedBy);

    res.status(201).json({
      message: 'Artifact published to chain successfully',
      artifactId,
      contentHash: result.contentHash,
      ipfsCid: result.storage.cid,
      txHash: result.chain.txHash,
      chain: result.chain.chain,
      blockNumber: result.chain.blockNumber,
      storageUrl: result.storage.url,
      storageSize: result.storage.size,
      publishedAt: result.chain.timestamp,
      creditCharged: req.apiKey?.role !== 'admin' ? 1 : 0,
      creditsRemaining: req.apiKey ? getCredits(getDb(), req.apiKey.id) : null,
    });
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404
      : err.message?.includes('already published') ? 409
      : 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/publish/:artifactId/verify
 * Verify that an artifact's content matches its on-chain record.
 */
router.get('/:artifactId/verify', async (req: Request, res: Response) => {
  try {
    const result = await verifyArtifact(req.params.artifactId as string);
    const status = result.verified ? 200 : 422;
    res.status(status).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/publish/chain-records
 * List all on-chain publication records.
 */
router.get('/chain-records', (_req: Request, res: Response) => {
  const rows = getDb()
    .prepare('SELECT * FROM chain_records ORDER BY publishedAt DESC')
    .all() as Row[];
  res.json(rows);
});

/**
 * GET /api/publish/ipfs/health
 * Check if the IPFS node is reachable (only meaningful when using IPFS provider).
 */
router.get('/ipfs/health', async (_req: Request, res: Response) => {
  if (config.storageProvider !== 'ipfs') {
    return res.json({
      provider: 'local',
      message: 'Using local storage adapter. Set ATLAS_STORAGE_PROVIDER=ipfs to enable IPFS.',
    });
  }

  const ipfs = new IpfsStorageAdapter();
  const healthy = await ipfs.isHealthy();
  const status = healthy ? 200 : 503;
  res.status(status).json({
    provider: 'ipfs',
    healthy,
    apiUrl: config.ipfs.apiUrl,
    gatewayUrl: config.ipfs.gatewayUrl,
  });
});

/**
 * GET /api/publish/:artifactId/bundle
 * Retrieve the full published bundle from decentralized storage.
 * Returns the exact JSON that was hashed and anchored on-chain.
 */
router.get('/:artifactId/bundle', async (req: Request, res: Response) => {
  try {
    const artifactId = req.params.artifactId as string;
    const artifact = getDb()
      .prepare('SELECT ipfsCid, txHash, contentHash FROM artifacts WHERE id = ?')
      .get(artifactId) as Row | undefined;

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    if (!artifact.ipfsCid) {
      return res.status(404).json({
        error: 'Artifact has not been published. No bundle available.',
        hint: 'Publish first with POST /api/publish/:artifactId',
      });
    }

    // Use the appropriate storage adapter to retrieve the bundle
    const storage = config.storageProvider === 'ipfs'
      ? new IpfsStorageAdapter()
      : new LocalStorageAdapter();

    const content = await storage.retrieve(artifact.ipfsCid);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Content-Hash', artifact.contentHash || '');
    res.setHeader('X-IPFS-CID', artifact.ipfsCid);
    res.send(content);
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 502;
    res.status(status).json({
      error: 'Failed to retrieve bundle from storage',
      detail: err.message,
    });
  }
});

export default router;



