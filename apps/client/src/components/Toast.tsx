import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence } from 'framer-motion';
import ToastView from '../design-system/components/Toast/ToastView';
import './style/Toast.css';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  show: (message: string, options?: { variant?: ToastVariant }) => void;
}

// How long a toast stays on screen before it dismisses itself.
const TOAST_TIMEOUT_MS = 5000;

const ToastContext = createContext<ToastApi>({ show: () => {} });

// A minimal toast/notification system: a provider that renders a bottom-centre
// stack, and a `useToast()` hook whose `show` queues a self-dismissing message.
// Replaces the unmaintained react-alert (React <=17 peers, function-component
// defaultProps that React 19 ignores) with the framer-motion we already use.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  const show = useCallback((message: string, options?: { variant?: ToastVariant }) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts(prev => [...prev, { id, message, variant: options?.variant ?? 'info' }]);
    const timer = window.setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, TOAST_TIMEOUT_MS);
    timers.current.push(timer);
  }, []);

  useEffect(() => () => {
    timers.current.forEach(timer => window.clearTimeout(timer));
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast__container">
        <AnimatePresence>
          {toasts.map(toast => (
            <ToastView
              key={toast.id}
              message={toast.message}
              variant={toast.variant}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
