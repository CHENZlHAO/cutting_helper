import { useState, useEffect, useRef } from 'react';
import client from '@/api/client';

export function useBackendHealth() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retries = useRef(0);
  const maxRetries = 30;

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await client.get('/api/health');
        if (res.data?.status === 'ok') {
          if (!cancelled) { setIsReady(true); setError(null); }
          return;
        }
      } catch {
        // backend not ready yet
      }
      retries.current++;
      if (retries.current >= maxRetries) {
        if (!cancelled) setError('无法连接到后端服务 (127.0.0.1:8765)');
        return;
      }
      if (!cancelled) setTimeout(check, 1000);
    };
    check();
    return () => { cancelled = true; };
  }, []);

  return { isReady, error };
}
