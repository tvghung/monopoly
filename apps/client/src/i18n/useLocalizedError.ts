import { useCallback, useMemo, useState } from 'react';
import type { AckError } from '@monopoly/shared';
import { localizeAckError } from '../game/ui/formatters';
import { useTranslation } from './I18n';
import type { MessageKey } from './catalog';
import type { MessageValues } from './I18n';

type LocalizedErrorValue =
  | { kind: 'key'; key: MessageKey; values?: MessageValues }
  | { kind: 'ack'; error: Pick<AckError, 'code' | 'message'> }
  | null;

/** Keep error state semantic so a language change updates an error that is already open. */
export function useLocalizedError() {
  const { language, t } = useTranslation();
  const [value, setValue] = useState<LocalizedErrorValue>(null);
  const clearError = useCallback(() => setValue(null), []);
  const setErrorKey = useCallback((key: MessageKey, values?: MessageValues) => {
    setValue({ kind: 'key', key, ...(values ? { values } : {}) });
  }, []);
  const setAckError = useCallback((error: Pick<AckError, 'code' | 'message'>) => {
    setValue({ kind: 'ack', error });
  }, []);
  const error = useMemo(() => {
    if (!value) return null;
    return value.kind === 'ack' ? localizeAckError(value.error, language) : t(value.key, value.values);
  }, [language, t, value]);
  return { error, clearError, setErrorKey, setAckError };
}
