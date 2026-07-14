import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, insertApiKey, TestAppContext, TEST_NOW } from './helpers/test-app';

let contexts: TestAppContext[] = [];

function testApp(): TestAppContext {
  const context = createTestApp();
  contexts.push(context);
  return context;
}

afterEach(() => {
  for (const context of contexts) context.close();
  contexts = [];
});

describe('createApp', () => {
  it('reports the injected local adapters without starting external services', async () => {
    const { app } = testApp();

    const response = await request(app).get('/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      service: 'korvo-atlas',
      version: '0.3.0',
      storageProvider: 'local',
      attestationProvider: 'local_simulation',
    });
  });

  it('uses an isolated database, deterministic clock, and deterministic ID generator', async () => {
    const first = testApp();
    const second = testApp();
    insertApiKey(first.dependencies);

    const created = await request(first.app)
      .post('/api/v1/questions')
      .set('Authorization', 'Bearer atl_test_admin')
      .send({ text: 'What guarantees should Atlas publication provide?' })
      .expect(201);

    expect(created.body).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'open',
      createdAt: TEST_NOW.toISOString(),
      updatedAt: TEST_NOW.toISOString(),
    });

    const canonical = await request(first.app).get('/api/v1/questions').expect(200);
    const legacy = await request(first.app).get('/api/questions').expect(200);
    const isolated = await request(second.app).get('/api/v1/questions').expect(200);

    expect(canonical.body.data).toHaveLength(1);
    expect(legacy.body).toEqual(canonical.body);
    expect(isolated.body).toMatchObject({ data: [], total: 0 });
  });

  it('keeps public reads open and rejects unauthenticated writes', async () => {
    const { app } = testApp();

    await request(app).get('/api/v1/questions').expect(200);
    const response = await request(app)
      .post('/api/v1/questions')
      .send({ text: 'Should this unauthenticated write be rejected?' })
      .expect(401);

    expect(response.body.error).toContain('Authorization');
  });
});

