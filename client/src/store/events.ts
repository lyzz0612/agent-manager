import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { WsClient, type WsStatus } from '../api/websocket';
import type { WsEvent } from '../api/types';
import { useAuth } from './auth';

export interface EventsState {
  status: WsStatus;
  subscribe: (listener: (event: WsEvent) => void) => () => void;
}

const EventsContext = createContext<EventsState | null>(null);

export function EventsProvider(props: { children: React.ReactNode }): React.ReactElement {
  const { session } = useAuth();
  const [status, setStatus] = useState<WsStatus>('idle');
  const clientRef = useRef<WsClient | null>(null);
  const listenersRef = useRef<Set<(e: WsEvent) => void>>(new Set());

  useEffect(() => {
    if (!session) {
      clientRef.current?.stop();
      clientRef.current = null;
      setStatus('idle');
      return;
    }

    const ws = new WsClient({ serverUrl: session.serverUrl, token: session.token });
    clientRef.current = ws;
    const unsubStatus = ws.onStatus((next) => setStatus(next));
    const unsubMsg = ws.subscribe((event) => {
      for (const listener of listenersRef.current) {
        listener(event);
      }
    });
    ws.start();

    return () => {
      unsubMsg();
      unsubStatus();
      ws.stop();
      if (clientRef.current === ws) {
        clientRef.current = null;
      }
    };
  }, [session]);

  const value = useMemo<EventsState>(
    () => ({
      status,
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    }),
    [status],
  );

  return React.createElement(EventsContext.Provider, { value }, props.children);
}

export function useEvents(): EventsState {
  const ctx = useContext(EventsContext);
  if (!ctx) {
    throw new Error('useEvents must be used within an EventsProvider');
  }
  return ctx;
}

/** Subscribe to a slice of WebSocket events with automatic cleanup. */
export function useEventListener(listener: (event: WsEvent) => void): void {
  const { subscribe } = useEvents();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => {
    return subscribe((event) => ref.current(event));
  }, [subscribe]);
}
