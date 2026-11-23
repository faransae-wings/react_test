import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'connecting' | 'open' | 'closed';

/** 자동 재접속 WebSocket. hello는 연결될 때마다 전송됩니다. */
export function useHuntSocket<V>(hello: object | null, onMessage?: (m: any) => void) {
  const [view, setView] = useState<V | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const helloRef = useRef(hello);
  helloRef.current = hello;
  const onMsg = useRef(onMessage);
  onMsg.current = onMessage;
  const key = JSON.stringify(hello);

  useEffect(() => {
    if (!helloRef.current) return;
    let stop = false;
    let timer: number;
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      wsRef.current = ws;
      setStatus('connecting');
      ws.onopen = () => {
        setStatus('open');
        ws.send(JSON.stringify(helloRef.current));
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'view') setView(m.view);
        else if (m.t === 'error') setError(m.msg);
        onMsg.current?.(m);
      };
      ws.onclose = () => {
        setStatus('closed');
        if (!stop) timer = window.setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      stop = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [key]);

  const send = useCallback((m: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === 1) ws.send(JSON.stringify(m));
  }, []);

  return { view, status, error, send };
}
