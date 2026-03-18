import express from 'express';
import cors from 'cors';
import { initDb } from './db/database';
import questionsRouter from './routes/questions';
import sourcesRouter from './routes/sources';
import claimsRouter from './routes/claims';
import artifactsRouter from './routes/artifacts';
import validatorsRouter from './routes/validators';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'korvo-atlas', version: '0.1.0' });
});

// API routes
app.use('/api/questions', questionsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/artifacts', artifactsRouter);
app.use('/api/validators', validatorsRouter);

// Initialize database and start server
initDb();
app.listen(PORT, () => {
  console.log(`🌐 Korvo Atlas API running at http://localhost:${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET/POST       /api/questions`);
  console.log(`   GET/POST       /api/sources`);
  console.log(`   GET/POST       /api/claims`);
  console.log(`   GET/POST       /api/artifacts`);
  console.log(`   GET/POST       /api/validators`);
  console.log(`   GET            /health`);
});

export default app;

