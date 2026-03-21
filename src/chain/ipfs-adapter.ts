/**
 * IPFS Storage Adapter — real content-addressed storage for Atlas.
 *
 * Talks to a Kubo node via its HTTP RPC API (/api/v0/*).
 * No npm dependencies — uses Node's built-in fetch.
 *
 * Setup:
 *   docker run -d --name ipfs -p 4001:4001 -p 5001:5001 -p 8080:8080 ipfs/kubo:latest
 *
 * Config:
 *   ATLAS_STORAGE_PROVIDER=ipfs
 *   ATLAS_IPFS_API_URL=http://localhost:5001
 *   ATLAS_IPFS_GATEWAY_URL=https://ipfs.io
 */

import { StorageAdapter, StorageResult } from './types';
import { config } from '../config';

export class IpfsStorageAdapter implements StorageAdapter {
  private readonly apiUrl: string;
  private readonly gatewayUrl: string;
  private readonly timeout: number;

  constructor() {
    this.apiUrl = config.ipfs.apiUrl;
    this.gatewayUrl = config.ipfs.gatewayUrl;
    this.timeout = config.ipfs.timeout;
  }

  /**
   * Upload content to IPFS via the Kubo /api/v0/add endpoint.
   *
   * Uses multipart/form-data because that's what Kubo expects.
   * Returns a real CID (content identifier) that is globally addressable.
   */
  async upload(content: string): Promise<StorageResult> {
    const url = `${this.apiUrl}/api/v0/add?cid-version=1&pin=true`;

    // Build multipart form data with the JSON content
    const boundary = `----AtlasBoundary${Date.now()}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="bundle.json"\r\n` +
      `Content-Type: application/json\r\n` +
      `\r\n` +
      `${content}\r\n` +
      `--${boundary}--\r\n`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown error');
      throw new Error(`IPFS upload failed (${response.status}): ${errText}`);
    }

    const result = await response.json() as { Hash: string; Size: string; Name: string };

    const cid = result.Hash;
    const size = parseInt(result.Size, 10) || Buffer.byteLength(content, 'utf8');

    console.log(`📤 [ipfs] Uploaded to IPFS: ${cid} (${size} bytes)`);

    return {
      cid,
      url: `${this.gatewayUrl}/ipfs/${cid}`,
      size,
    };
  }

  /**
   * Retrieve content from IPFS via the Kubo /api/v0/cat endpoint.
   *
   * Falls back to public gateway if the local node doesn't have it.
   */
  async retrieve(cid: string): Promise<string> {
    // Try Kubo RPC API first (fastest if node has it pinned)
    try {
      const url = `${this.apiUrl}/api/v0/cat?arg=${cid}`;
      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (response.ok) {
        return await response.text();
      }
    } catch {
      // Kubo API failed — try gateway
    }

    // Fallback: try the public gateway (works even if local node is down)
    const gatewayResponse = await fetch(`${this.gatewayUrl}/ipfs/${cid}`, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!gatewayResponse.ok) {
      throw new Error(`IPFS retrieve failed for CID ${cid}: not found on node or gateway`);
    }

    return await gatewayResponse.text();
  }

  /**
   * Check if the IPFS node is reachable.
   * Useful for health checks.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v0/id`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

