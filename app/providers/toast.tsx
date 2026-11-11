'use client';

import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastValue = { notify: (message: string, link?: { href: string; label: string }) => void };
const ToastContext = createContext<ToastValue>({ notify: () => undefined });

export function ToastProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState('');
  const [link, setLink] = useState<{ href: string; label: string }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = useCallback((m: string, l?: { href: string; label: string }) => {
    setMessage(m);
    setLink(l);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), l ? 6000 : 3600);
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
          {link && (
            <>
              {' '}
              <a href={link.href} target="_blank" rel="noreferrer">{link.label} ↗</a>
            </>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}
