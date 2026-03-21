/**
 * Atlas Publish Pricing & Credits
 *
 * Publishing to the blockchain is not free — just like Ethereum and Bitcoin
 * charge gas fees, Atlas charges a small publish fee to cover:
 *   1. Blockchain gas costs (actual chain transaction)
 *   2. Decentralized storage costs (IPFS/Arweave pinning)
 *   3. Infrastructure margin (keeps Atlas running)
 *
 * Reads are ALWAYS free. Verification is ALWAYS free.
 * Only writes to the blockchain cost money.
 *
 * Pricing tiers:
 *   - Per-publish:  $2 per artifact anchored on-chain
 *   - Pro plan:     $19/mo includes 50 publishes (~$0.38 each)
 *   - Team plan:    $149/mo includes 500 publishes (~$0.30 each)
 *   - Enterprise:   custom pricing
 *
 * Internally, everything runs on "credits":
 *   1 credit = 1 blockchain publish
 *   Users buy credits or get them via subscription
 */

export interface PricingTier {
  name: string;
  credits: number;
  priceUsd: number;
  perPublishUsd: number;
}

export const PRICING: Record<string, PricingTier> = {
  single: {
    name: 'Single Publish',
    credits: 1,
    priceUsd: 2.00,
    perPublishUsd: 2.00,
  },
  pack_10: {
    name: '10-Pack',
    credits: 10,
    priceUsd: 15.00,
    perPublishUsd: 1.50,
  },
  pro: {
    name: 'Pro (monthly)',
    credits: 50,
    priceUsd: 19.00,
    perPublishUsd: 0.38,
  },
  team: {
    name: 'Team (monthly)',
    credits: 500,
    priceUsd: 149.00,
    perPublishUsd: 0.30,
  },
};

/** Estimated actual cost to Korvo per publish (gas + storage) */
export const COST_PER_PUBLISH_USD = 0.02;

/**
 * Get the current credit balance for an API key.
 */
export function getCredits(db: any, apiKeyId: string): number {
  const row = db.prepare('SELECT credits FROM publish_credits WHERE apiKeyId = ?').get(apiKeyId) as any;
  return row?.credits || 0;
}

/**
 * Deduct one credit for a publish operation.
 * Returns true if successful, false if insufficient credits.
 */
export function deductCredit(db: any, apiKeyId: string): boolean {
  const current = getCredits(db, apiKeyId);
  if (current <= 0) return false;

  db.prepare('UPDATE publish_credits SET credits = credits - 1, updatedAt = ? WHERE apiKeyId = ?')
    .run(new Date().toISOString(), apiKeyId);

  // Log the transaction
  db.prepare(`INSERT INTO credit_transactions (id, apiKeyId, amount, type, description, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      require('uuid').v4(),
      apiKeyId,
      -1,
      'publish',
      'Blockchain publish fee',
      new Date().toISOString()
    );

  return true;
}

/**
 * Add credits to an API key (after payment).
 */
export function addCredits(db: any, apiKeyId: string, amount: number, description: string): void {
  const existing = db.prepare('SELECT apiKeyId FROM publish_credits WHERE apiKeyId = ?').get(apiKeyId) as any;

  if (existing) {
    db.prepare('UPDATE publish_credits SET credits = credits + ?, updatedAt = ? WHERE apiKeyId = ?')
      .run(amount, new Date().toISOString(), apiKeyId);
  } else {
    db.prepare('INSERT INTO publish_credits (apiKeyId, credits, updatedAt) VALUES (?, ?, ?)')
      .run(apiKeyId, amount, new Date().toISOString());
  }

  // Log the transaction
  db.prepare(`INSERT INTO credit_transactions (id, apiKeyId, amount, type, description, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      require('uuid').v4(),
      apiKeyId,
      amount,
      'purchase',
      description,
      new Date().toISOString()
    );
}

