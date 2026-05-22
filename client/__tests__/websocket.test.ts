import { WsClient, computeBackoffMs } from '../src/api/websocket';
import type { WsEvent } from '../src/api/types';

class FakeSocket {
  public static instances: FakeSocket[] = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public url: string;
  public closed = false;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
  emitOpen(): void {
    this.onopen?.();
  }
  emitMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe('computeBackoffMs', () => {
  it('grows exponentially and is capped', () => {
    expect(computeBackoffMs(0)).toBe(500);
    expect(computeBackoffMs(1)).toBe(1000);
    expect(computeBackoffMs(2)).toBe(2000);
    expect(computeBackoffMs(20)).toBe(30_000);
  });
});

describe('WsClient', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('dispatches JSON events to subscribers', () => {
    const ws = new WsClient({
      serverUrl: 'http://x',
      token: 't',
      WebSocketCtor: FakeSocket as unknown as typeof WebSocket,
    });
    const received: WsEvent[] = [];
    ws.subscribe((e) => received.push(e));
    ws.start();
    const sock = FakeSocket.instances[0]!;
    sock.emitOpen();
    sock.emitMessage({ type: 'machine.deleted', machineId: 'm1' });
    expect(received).toEqual([{ type: 'machine.deleted', machineId: 'm1' }]);
    ws.stop();
  });

  it('reconnects after a close with exponential backoff', () => {
    const ws = new WsClient({
      serverUrl: 'http://x',
      token: 't',
      WebSocketCtor: FakeSocket as unknown as typeof WebSocket,
      initialBackoffMs: 100,
      maxBackoffMs: 5_000,
    });
    ws.start();
    expect(FakeSocket.instances).toHaveLength(1);

    FakeSocket.instances[0]!.close();
    jest.advanceTimersByTime(100);
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.instances[1]!.close();
    jest.advanceTimersByTime(200);
    expect(FakeSocket.instances).toHaveLength(3);

    ws.stop();
  });

  it('stops scheduling reconnects after stop()', () => {
    const ws = new WsClient({
      serverUrl: 'http://x',
      token: 't',
      WebSocketCtor: FakeSocket as unknown as typeof WebSocket,
      initialBackoffMs: 100,
    });
    ws.start();
    ws.stop();
    jest.advanceTimersByTime(5_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
