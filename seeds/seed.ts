/**
 * Seed script — populates the database with example research data
 * to demonstrate the Korvo Atlas object model in action.
 *
 * Usage:  npx ts-node seeds/seed.ts
 */

import { initDb, getDb } from '../src/db/database';
import { v4 as uuid } from 'uuid';

initDb();
const db = getDb();
const now = new Date().toISOString();

// ── Validators ──────────────────────────────────────────────
const validators = [
  {
    id: uuid(), name: 'Alice Chen', type: 'human',
    expertise: ['AI safety', 'machine learning'],
    reputation: 72, validationCount: 14,
  },
  {
    id: uuid(), name: 'Atlas Review Bot', type: 'agent',
    expertise: ['source verification', 'link checking'],
    reputation: 45, validationCount: 230,
  },
];

for (const v of validators) {
  db.prepare(`INSERT INTO validators (id, name, type, expertise, reputation, validationCount, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    v.id, v.name, v.type, JSON.stringify(v.expertise), v.reputation, v.validationCount, now, now
  );
}
console.log(`✅ Seeded ${validators.length} validators`);

// ── Questions ───────────────────────────────────────────────
const questions = [
  {
    id: uuid(),
    text: 'What are the primary risks of training large language models on synthetic data?',
    context: 'As AI labs increasingly use model-generated data for training, understanding quality and safety implications is critical.',
    tags: ['AI', 'synthetic data', 'LLM', 'safety'],
    status: 'in_progress',
    createdBy: validators[0].name,
  },
  {
    id: uuid(),
    text: 'How does retrieval-augmented generation (RAG) compare to fine-tuning for domain-specific accuracy?',
    context: 'Enterprise teams need to choose between RAG pipelines and fine-tuning when adapting LLMs.',
    tags: ['RAG', 'fine-tuning', 'LLM', 'enterprise'],
    status: 'open',
    createdBy: validators[0].name,
  },
];

for (const q of questions) {
  db.prepare(`INSERT INTO questions (id, text, context, tags, status, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    q.id, q.text, q.context, JSON.stringify(q.tags), q.status, q.createdBy, now, now
  );
}
console.log(`✅ Seeded ${questions.length} questions`);

// ── Sources ─────────────────────────────────────────────────
const sources = [
  {
    id: uuid(), type: 'paper',
    title: 'The Curse of Recursion: Training on Generated Data Makes Models Forget',
    url: 'https://arxiv.org/abs/2305.17493',
    author: 'Shumailov et al.',
    publishedAt: '2023-05-27T00:00:00Z',
    tags: ['model collapse', 'synthetic data', 'LLM'],
  },
  {
    id: uuid(), type: 'paper',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    url: 'https://arxiv.org/abs/2005.11401',
    author: 'Lewis et al.',
    publishedAt: '2020-05-22T00:00:00Z',
    tags: ['RAG', 'NLP', 'knowledge retrieval'],
  },
  {
    id: uuid(), type: 'url',
    title: 'Scaling Data-Constrained Language Models (research blog)',
    url: 'https://huggingface.co/blog/synthetic-data-save-costs',
    author: 'Hugging Face',
    publishedAt: '2024-01-15T00:00:00Z',
    tags: ['synthetic data', 'scaling', 'LLM'],
  },
];

for (const s of sources) {
  db.prepare(`INSERT INTO sources (id, type, title, url, author, publishedAt, tags, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    s.id, s.type, s.title, s.url, s.author, s.publishedAt,
    JSON.stringify(s.tags), validators[0].name, now, now
  );
}
console.log(`✅ Seeded ${sources.length} sources`);

// ── Claims ──────────────────────────────────────────────────
const claims = [
  {
    id: uuid(),
    statement: 'Training language models on their own synthetic outputs leads to progressive degradation of output quality, a phenomenon termed "model collapse".',
    confidence: 'high',
    sourceIds: [sources[0].id],
    questionId: questions[0].id,
    status: 'published',
    tags: ['model collapse', 'synthetic data'],
  },
  {
    id: uuid(),
    statement: 'Retrieval-augmented generation reduces hallucination rates compared to closed-book generation by grounding outputs in retrieved documents.',
    confidence: 'high',
    sourceIds: [sources[1].id],
    questionId: questions[1].id,
    status: 'published',
    tags: ['RAG', 'hallucination'],
  },
  {
    id: uuid(),
    statement: 'Mixing small amounts of high-quality synthetic data with real data can improve model performance when real data is scarce.',
    confidence: 'medium',
    sourceIds: [sources[0].id, sources[2].id],
    questionId: questions[0].id,
    status: 'draft',
    tags: ['synthetic data', 'data mixing'],
  },
];

for (const c of claims) {
  db.prepare(`INSERT INTO claims (id, statement, confidence, sourceIds, questionId, status, tags, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    c.id, c.statement, c.confidence, JSON.stringify(c.sourceIds),
    c.questionId, c.status, JSON.stringify(c.tags),
    validators[0].name, now, now
  );
}
console.log(`✅ Seeded ${claims.length} claims`);

// ── Artifacts ───────────────────────────────────────────────
const artifacts = [
  {
    id: uuid(),
    title: 'Synthetic Data Risks for LLM Training — Research Brief',
    type: 'brief',
    body: `## Summary\n\nThis brief examines the risks of using AI-generated (synthetic) data to train large language models.\n\n## Key Findings\n\n1. **Model Collapse** — Shumailov et al. (2023) demonstrated that iteratively training on model outputs causes progressive quality degradation.\n2. **Data Mixing** — Early evidence suggests that blending small amounts of synthetic data with real corpora can help when real data is limited, but the ratio matters.\n3. **No Free Lunch** — Synthetic data is not a substitute for high-quality human-generated data for safety-critical applications.\n\n## Open Questions\n\n- What is the safe upper bound for synthetic-to-real data ratio?\n- How do filtering and quality checks change the calculus?`,
    summary: 'Research brief on the risks and trade-offs of training LLMs on synthetic data.',
    questionId: questions[0].id,
    claimIds: [claims[0].id, claims[2].id],
    sourceIds: [sources[0].id, sources[2].id],
    status: 'published',
    tags: ['AI', 'synthetic data', 'brief'],
  },
];

for (const a of artifacts) {
  db.prepare(`INSERT INTO artifacts (id, title, type, body, summary, questionId, claimIds, sourceIds, status, tags, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    a.id, a.title, a.type, a.body, a.summary, a.questionId,
    JSON.stringify(a.claimIds), JSON.stringify(a.sourceIds),
    a.status, JSON.stringify(a.tags),
    validators[0].name, now, now
  );
}
console.log(`✅ Seeded ${artifacts.length} artifacts`);

// ── API Keys ────────────────────────────────────────────────
const DEV_ADMIN_KEY = 'atl_dev_admin_000000000000000000000000';
const DEV_CONTRIBUTOR_KEY = 'atl_dev_contributor_0000000000000000';

db.prepare(`INSERT INTO api_keys (id, key, name, role, createdAt, revokedAt)
  VALUES (?, ?, ?, ?, ?, ?)`).run(uuid(), DEV_ADMIN_KEY, 'Dev Admin', 'admin', now, null);
db.prepare(`INSERT INTO api_keys (id, key, name, role, createdAt, revokedAt)
  VALUES (?, ?, ?, ?, ?, ?)`).run(uuid(), DEV_CONTRIBUTOR_KEY, 'Dev Contributor', 'contributor', now, null);
console.log(`✅ Seeded 2 API keys`);
console.log(`   Admin key:       ${DEV_ADMIN_KEY}`);
console.log(`   Contributor key:  ${DEV_CONTRIBUTOR_KEY}`);

// ── Challenges ──────────────────────────────────────────────
const challenges = [
  {
    id: uuid(),
    claimId: claims[2].id,
    challengerId: validators[1].id,
    reason: 'The claim that mixing synthetic data improves performance lacks sufficient evidence for the general case. The cited sources only demonstrate this for narrow benchmarks.',
    evidence: 'See: "Scaling Data-Constrained Language Models" — results are benchmark-specific and do not generalize.',
    status: 'open',
  },
];

for (const ch of challenges) {
  db.prepare(`INSERT INTO challenges (id, claimId, challengerId, reason, evidence, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ch.id, ch.claimId, ch.challengerId, ch.reason, ch.evidence, ch.status, now, now
  );
  // Auto-dispute the claim
  db.prepare(`UPDATE claims SET status = 'disputed', updatedAt = ? WHERE id = ?`).run(now, ch.claimId);
}
console.log(`✅ Seeded ${challenges.length} challenges`);

// ── Endorsements ────────────────────────────────────────────
const endorsements = [
  {
    id: uuid(),
    claimId: claims[0].id,
    validatorId: validators[0].id,
    comment: 'Strong evidence from the Shumailov et al. paper. Model collapse is well-documented.',
    weight: 5,
  },
  {
    id: uuid(),
    claimId: claims[0].id,
    validatorId: validators[1].id,
    comment: 'Automated link check confirms source is accessible and content matches.',
    weight: 3,
  },
  {
    id: uuid(),
    claimId: claims[1].id,
    validatorId: validators[0].id,
    comment: 'RAG hallucination reduction is well-established in the literature.',
    weight: 4,
  },
];

for (const e of endorsements) {
  db.prepare(`INSERT INTO endorsements (id, claimId, validatorId, comment, weight, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    e.id, e.claimId, e.validatorId, e.comment, e.weight, now
  );
}
console.log(`✅ Seeded ${endorsements.length} endorsements`);

console.log('\n🌐 Database seeded successfully. Start the server with: npm run dev');
console.log('🔑 Use the dev admin key for write operations:');
console.log(`   Authorization: Bearer ${DEV_ADMIN_KEY}`);

