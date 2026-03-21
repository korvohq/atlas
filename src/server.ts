import express from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { initDb } from './db/database';
import { requireAuth } from './middleware/auth';
import questionsRouter from './routes/questions';
import sourcesRouter from './routes/sources';
import claimsRouter from './routes/claims';
import artifactsRouter from './routes/artifacts';
import validatorsRouter from './routes/validators';
import publishRouter from './routes/publish';
import challengesRouter from './routes/challenges';
import endorsementsRouter from './routes/endorsements';
import keysRouter from './routes/keys';
import creditsRouter from './routes/credits';
import searchRouter from './routes/search';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting — protect against bulk scraping
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,                   // 300 requests per window for reads
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.', retryAfter: '15 minutes' },
});
app.use('/api', apiLimiter);

// Stricter limit for write operations
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write requests. Please slow down.', retryAfter: '15 minutes' },
});
app.use('/api', (req, _res, next) => {
  if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return writeLimiter(req, _res, next);
  }
  next();
});

// AI scraping protection headers
app.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noai, noimageai');
  next();
});

app.use(requireAuth);

// Serve robots.txt
app.get('/robots.txt', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'robots.txt'));
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'korvo-atlas', version: '0.3.0' });
});

// API routes (v1 — canonical)
app.use('/api/v1/questions', questionsRouter);
app.use('/api/v1/sources', sourcesRouter);
app.use('/api/v1/claims', claimsRouter);
app.use('/api/v1/artifacts', artifactsRouter);
app.use('/api/v1/validators', validatorsRouter);
app.use('/api/v1/publish', publishRouter);
app.use('/api/v1/challenges', challengesRouter);
app.use('/api/v1/endorsements', endorsementsRouter);
app.use('/api/v1/keys', keysRouter);
app.use('/api/v1/credits', creditsRouter);
app.use('/api/v1/search', searchRouter);

// Legacy routes (backward compatible — will be removed in v1.0)
app.use('/api/questions', questionsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/artifacts', artifactsRouter);
app.use('/api/validators', validatorsRouter);
app.use('/api/publish', publishRouter);
app.use('/api/challenges', challengesRouter);
app.use('/api/endorsements', endorsementsRouter);
app.use('/api/keys', keysRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/search', searchRouter);

// Initialize database and start server
initDb();
app.listen(PORT, () => {
  console.log(`🌐 Korvo Atlas API v0.3.0 running at http://localhost:${PORT}`);
  console.log(`📡 API v1 endpoints: /api/v1/{resource}`);
  console.log(`📡 Legacy endpoints: /api/{resource} (deprecated)`);
  console.log(`🔍 Full-text search: GET /api/v1/search?q=...`);
  console.log(`🛡️  Rate limited: 300 reads / 50 writes per 15 min`);
  console.log(`🤖 AI scraping blocked via robots.txt + X-Robots-Tag`);
  console.log(`   GET            /api/credits/transactions`);
  console.log(`   POST/GET/DEL   /api/keys (admin only)`);
  console.log(`   GET            /health`);
  console.log(`🔑 Auth: write ops require Bearer API key`);
  console.log(`💰 Publish: costs 1 credit per artifact (buy at /api/credits/purchase)`);
});

export default app;

