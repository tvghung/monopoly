import { ActionIcon } from '../../design-system/icons/ActionIcon';
import ErrorScreen from './ErrorScreen';
import { useTranslation } from '../../i18n/I18n';

export type BootstrapErrorKind = 'bootstrap' | 'runtime-config' | 'render';

const errorCopy: Record<BootstrapErrorKind, 'bootstrap.errorMessage' | 'bootstrap.runtimeError' | 'bootstrap.renderError'> = {
  bootstrap: 'bootstrap.errorMessage',
  'runtime-config': 'bootstrap.runtimeError',
  render: 'bootstrap.renderError',
};

interface BootstrapErrorScreenProps {
  kind?: BootstrapErrorKind;
  onRetry: () => void;
  title?: string;
  actionLabel?: string;
}

export default function BootstrapErrorScreen({
  kind = 'bootstrap',
  onRetry,
  title,
  actionLabel,
}: BootstrapErrorScreenProps) {
  const { t } = useTranslation();
  return (
    <ErrorScreen
      title={title ?? t('bootstrap.errorTitle')}
      message={t(errorCopy[kind])}
      action={{ label: actionLabel ?? t(kind === 'render' ? 'bootstrap.reload' : 'bootstrap.retry'), icon: <ActionIcon name="retry" />, onClick: onRetry }}
    />
  );
}
