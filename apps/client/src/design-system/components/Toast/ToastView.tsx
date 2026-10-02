import { motion } from 'framer-motion';
import { ActionIcon } from '../../icons/ActionIcon';
import type { ActionIconName } from '../../icons/actionIcons';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import { motionEase, motionTokens } from '../../motion/motionTokens';
import './ToastView.css';

interface ToastViewProps {
  message: string;
  variant: 'info' | 'success' | 'warning' | 'error';
}

const VARIANT_ICON: Record<ToastViewProps['variant'], ActionIconName> = {
  info: 'info', success: 'success', warning: 'warning', error: 'error',
};

/** A paper chip with an accent bar and an icon per variant; the message is always rendered as plain text. */
export default function ToastView({ message, variant }: ToastViewProps) {
  const reduced = useEffectiveReducedMotion();
  return (
    <motion.div
      className={`ds-toast ds-toast--${variant}`}
      role="status"
      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      animate={reduced ? {} : { opacity: 1, scale: 1 }}
      exit={reduced ? {} : { opacity: 0, scale: 0.9 }}
      transition={{ duration: reduced ? 0 : motionTokens.toastEnter, ease: motionEase.out }}
    >
      <span className="ds-toast__icon" aria-hidden="true"><ActionIcon name={VARIANT_ICON[variant]} size={20} /></span>
      <span className="ds-toast__message">{message}</span>
    </motion.div>
  );
}
