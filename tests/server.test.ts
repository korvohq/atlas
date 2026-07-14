import { describe, expect, it } from 'vitest';

interface ProcessWithHandles extends NodeJS.Process {
  _getActiveHandles(): Array<{ constructor?: { name?: string } }>;
}

function listeningServerCount(): number {
  return (process as ProcessWithHandles)
    ._getActiveHandles()
    .filter((handle) => handle.constructor?.name === 'Server').length;
}

describe('server entry point', () => {
  it('can be imported without opening an HTTP listener', async () => {
    const before = listeningServerCount();

    const server = await import('../src/server');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(server.createApp).toBeTypeOf('function');
    expect(server.startServer).toBeTypeOf('function');
    expect(listeningServerCount()).toBe(before);
  });
});

