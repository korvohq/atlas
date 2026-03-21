/**
 * Atlas Configuration
 *
 * Centralized config from environment variables with sensible defaults.
 * All IPFS settings are optional — Atlas falls back to local storage
 * if IPFS is not configured.
 */

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  // ── Storage provider ──────────────────────────────────────
  // 'local' (default) or 'ipfs'
  storageProvider: (process.env.ATLAS_STORAGE_PROVIDER || 'local') as 'local' | 'ipfs',

  // ── IPFS settings (only used when storageProvider = 'ipfs') ──
  ipfs: {
    /** Kubo RPC API endpoint (e.g. http://localhost:5001) */
    apiUrl: process.env.ATLAS_IPFS_API_URL || 'http://localhost:5001',

    /** Public gateway for constructing retrieval URLs */
    gatewayUrl: process.env.ATLAS_IPFS_GATEWAY_URL || 'http://localhost:8080',

    /** Timeout for IPFS operations in milliseconds */
    timeout: parseInt(process.env.ATLAS_IPFS_TIMEOUT || '30000', 10),
  },

  // ── Chain settings ────────────────────────────────────────
  chainNetwork: process.env.ATLAS_CHAIN_NETWORK || 'local',
} as const;

