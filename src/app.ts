import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { AppDependencies } from './app-dependencies';
import { createRequireAuth } from './middleware/auth';
import { createQuestionsRouter } from './routes/questions';
import { createSourcesRouter } from './routes/sources';
import { createClaimsRouter } from './routes/claims';
import { createArtifactsRouter } from './routes/artifacts';
import { createValidatorsRouter } from './routes/validators';
import { createPublishRouter } from './routes/publish';
import { createChallengesRouter } from './routes/challenges';
import { createEndorsementsRouter } from './routes/endorsements';
import { createKeysRouter } from './routes/keys';
import { createCreditsRouter } from './routes/credits';
import { createSearchRouter } from './routes/search';

export interface CreateAppOptions {
  rateLimit?: boolean;
}

/** Construct the HTTP application without opening a database, touching adapters, or listening. */
export function createApp(
  dependencies: AppDependencies,
  options: CreateAppOptions = {},
): Express {
  const app = express();
  app.locals.dependencies = dependencies;

  app.use(cors());
  app.use(express.json());

  if (options.rateLimit !== false) {
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please slow down.', retryAfter: '15 minutes' },
    });
    app.use('/api', apiLimiter);

    const writeLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 50,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many write requests. Please slow down.', retryAfter: '15 minutes' },
    });
    app.use('/api', (req, res, next) => {
      if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
        return writeLimiter(req, res, next);
      }
      next();
    });
  }

  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noai, noimageai');
    next();
  });

  app.use(createRequireAuth(dependencies.db));

  app.get('/robots.txt', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'robots.txt'));
  });

  app.get('/health', async (_req, res) => {
    const health: Record<string, unknown> = {
      status: 'ok',
      service: 'korvo-atlas',
      version: '0.3.0',
      storageProvider: dependencies.storageInfo.provider,
      attestationProvider: dependencies.chain.network === 'local'
        ? 'local_simulation'
        : dependencies.chain.network,
    };

    if (dependencies.storageInfo.provider === 'ipfs') {
      health.ipfs = {
        healthy: dependencies.storageInfo.isHealthy
          ? await dependencies.storageInfo.isHealthy()
          : false,
        apiUrl: dependencies.storageInfo.apiUrl,
      };
    }

    res.json(health);
  });

  const routers = {
    questions: createQuestionsRouter(dependencies),
    sources: createSourcesRouter(dependencies),
    claims: createClaimsRouter(dependencies),
    artifacts: createArtifactsRouter(dependencies),
    validators: createValidatorsRouter(dependencies),
    publish: createPublishRouter(dependencies),
    challenges: createChallengesRouter(dependencies),
    endorsements: createEndorsementsRouter(dependencies),
    keys: createKeysRouter(dependencies),
    credits: createCreditsRouter(dependencies),
    search: createSearchRouter(dependencies),
  };

  for (const [resource, router] of Object.entries(routers)) {
    app.use(`/api/v1/${resource}`, router);
  }

  for (const [resource, router] of Object.entries(routers)) {
    app.use(`/api/${resource}`, router);
  }

  return app;
}

