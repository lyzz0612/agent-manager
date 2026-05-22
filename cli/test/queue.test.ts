import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { PerAgentSerialQueue } from '../src/executor/queue.ts';

function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('PerAgentSerialQueue', () => {
  it('serialises actions for the same agent', async () => {
    const queue = new PerAgentSerialQueue();
    const order: string[] = [];
    const first = defer<void>();
    const second = defer<void>();

    const p1 = queue.enqueue('cursor', async () => {
      order.push('a-start');
      await first.promise;
      order.push('a-end');
    });
    const p2 = queue.enqueue('cursor', async () => {
      order.push('b-start');
      await second.promise;
      order.push('b-end');
    });

    // Allow the queue to start the first task.
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(order, ['a-start']);

    first.resolve();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(order, ['a-start', 'a-end', 'b-start']);

    second.resolve();
    await Promise.all([p1, p2]);
    assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('parallelises actions for different agents', async () => {
    const queue = new PerAgentSerialQueue();
    const order: string[] = [];
    const cursor = defer<void>();
    const codex = defer<void>();

    const p1 = queue.enqueue('cursor', async () => {
      order.push('cursor-start');
      await cursor.promise;
      order.push('cursor-end');
    });
    const p2 = queue.enqueue('codex', async () => {
      order.push('codex-start');
      await codex.promise;
      order.push('codex-end');
    });

    await new Promise((r) => setImmediate(r));
    assert.deepEqual(order, ['cursor-start', 'codex-start']);

    codex.resolve();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(order, ['cursor-start', 'codex-start', 'codex-end']);

    cursor.resolve();
    await Promise.all([p1, p2]);
    assert.deepEqual(order.sort(), [
      'codex-end',
      'codex-start',
      'cursor-end',
      'cursor-start',
    ]);
  });

  it('continues with subsequent work even if previous failed', async () => {
    const queue = new PerAgentSerialQueue();
    const first = queue.enqueue('cursor', async () => {
      throw new Error('boom');
    });
    const second = queue.enqueue('cursor', async () => 'ok');
    await assert.rejects(first, /boom/);
    assert.equal(await second, 'ok');
  });
});
