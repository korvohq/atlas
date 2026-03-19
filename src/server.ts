import express from 'express';
import cors from 'cors';
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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requireAuth);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'korvo-atlas', version: '0.2.0' });
});

// API routes
app.use('/api/questions', questionsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/artifacts', artifactsRouter);
app.use('/api/validators', validatorsRouter);
app.use('/api/publish', publishRouter);
app.use('/api/challenges', challengesRouter);
app.use('/api/endorsements', endorsementsRouter);
app.use('/api/keys', keysRouter);

// Initialize database and start server
initDb();
app.listen(PORT, () => {
  console.log(`🌐 Korvo Atlas API v0.2.0 running at http://localhost:${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET/POST       /api/questions`);
  console.log(`   GET/POST       /api/sources`);
  console.log(`   GET/POST       /api/claims`);
  console.log(`   GET/POST       /api/artifacts`);
  console.log(`   GET            /api/artifacts/:id/history`);
  console.log(`   GET/POST       /api/validators`);
  console.log(`   GET/POST       /api/challenges`);
  console.log(`   GET            /api/challenges/claim/:claimId`);
  console.log(`   GET/POST       /api/endorsements`);
  console.log(`   GET            /api/endorsements/claim/:claimId`);
  console.log(`   POST           /api/publish/:artifactId`);
  console.log(`   GET            /api/publish/:artifactId/verify`);
  console.log(`   GET            /api/publish/chain-records`);
  console.log(`   POST/GET/DEL   /api/keys (admin only)`);
  console.log(`   GET            /health`);
  console.log(`🔑 Auth: write ops require Bearer API key`);
});

export default app;

