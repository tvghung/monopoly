import { motion } from 'framer-motion';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import './ToastView.css';

interface ToastViewProps {
  message: string;
  variant: 'info' | 'success' | 'warning' | 'error';
}

export default function ToastView({ message, variant }: ToastViewProps) {
  const reduced = useEffectiveReducedMotion();
  return (
    <motion.div
      className={`ds-toast ds-toast--${variant}`}
      role="status"
      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      animate={reduced ? {} : { opacity: 1, scale: 1 }}
      exit={reduced ? {} : { opacity: 0, scale: 0.9 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: 'easeOut' }}
    >
      {message}
    </motion.div>
  );
}

