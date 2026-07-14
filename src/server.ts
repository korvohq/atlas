import { Server } from 'http';
import { createApp, CreateAppOptions } from './app';
import { AppDependencies, createDefaultAppDependencies } from './app-dependencies';
import { initDb } from './db/database';
import { config } from './config';

export interface StartServerOptions extends CreateAppOptions {
  port?: number;
  dependencies?: AppDependencies;
}

export function startServer(options: StartServerOptions = {}): Server {
  const dependencies = options.dependencies || createDefaultAppDependencies();
  const port = options.port ?? config.port;
  initDb(dependencies.db);
  const app = createApp(dependencies, { rateLimit: options.rateLimit });

  return app.listen(port, () => {
  console.log(`🌐 Korvo Atlas API v0.3.0 running at http://localhost:${port}`);
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
}

if (require.main === module) {
  startServer();
}

export { createApp } from './app';

