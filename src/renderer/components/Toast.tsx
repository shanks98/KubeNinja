import { useEffect, useState } from 'react';
import type { Result } from '@shared/types';

let push: ((m: string) => void) | null = null;

export function toast(message: string): void { push?.(message); }

/** Toast the outcome of a mutating IPC call. */
export function notifyResult(r: Result<unknown>, okMessage = 'Done'): void {
  toast(r.ok ? okMessage : r.error);
}

export function ToastHost() {
  const [items, setItems] = useState<{ id: number; message: string }[]>([]);
  useEffect(() => {
    let n = 0;
    push = (message) => {
      const id = ++n;
      setItems((xs) => [...xs, { id, message }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
    };
    return () => { push = null; };
  }, []);
  return (
    <div className="toasts">
      {items.map((t) => <div key={t.id} className="toast">{t.message}</div>)}
    </div>
  );
}
