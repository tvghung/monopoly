import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import './style/Toast.css';

interface ToastItem {
  id: number;
  message: string;
}

interface ToastApi {
  show: (message: string) => void;
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
  const reduced = useReducedMotion() ?? false;

  const show = useCallback((message: string) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, TOAST_TIMEOUT_MS);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast__container">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              className="toast"
              role="status"
              initial={reduced ? false : { opacity: 0, scale: 0.8 }}
              animate={reduced ? {} : { opacity: 1, scale: 1 }}
              exit={reduced ? {} : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
