/**
 * Publish & verify routes — blockchain operations for artifacts.
 *
 * POST /api/publish/:artifactId   — publish an artifact to the blockchain
 * GET  /api/publish/:artifactId/verify — verify an artifact against its on-chain record
 * GET  /api/publish/chain-records  — list all chain records
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { publishToChain, verifyArtifact } from '../chain';

type Row = Record<string, any>;

const router = Router();

/**
 * POST /api/publish/:artifactId
 * Publish a draft artifact to the blockchain.
 */
router.post('/:artifactId', async (req: Request, res: Response) => {
  try {
    const artifactId = req.params.artifactId as string;
    const publishedBy = req.body.publishedBy || 'anonymous';

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

export default router;



