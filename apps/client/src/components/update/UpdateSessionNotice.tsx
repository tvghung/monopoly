import { useEffect, useRef } from 'react';
import { useAppUpdate } from '../../runtime/appUpdate';
import { useTranslation } from '../../i18n/I18n';
import { useToast } from '../Toast';
import { getUpdateCopy } from './updateCopy';

/**
 * In a lobby or a game nothing about an update interrupts the play. The one thing worth saying is that an update is waiting,
 * once per update and moment: a downloaded one is ready for after the game, and a mandatory one was found. A player who
 * pressed "Để sau" is not reminded. Renders nothing.
 */
export default function UpdateSessionNotice() {
  const { state, inSession, deferred } = useAppUpdate();
  const { language } = useTranslation();
  const copy = getUpdateCopy(language);
  const toast = useToast();
  // What was already said in this session, by update version.
  const said = useRef(new Set<string>());

  const version = state?.update?.version;
  const mandatory = state?.update?.mandatory === true;
  const phase = state?.phase;

  useEffect(() => {
    if (!inSession || !version) return;
    if (phase === 'ready' && !deferred) {
      const key = `ready:${version}`;
      if (said.current.has(key)) return;
      said.current.add(key);
      toast.show(copy.readyAfterGame);
    } else if (phase === 'available' && mandatory) {
      const key = `required:${version}`;
      if (said.current.has(key)) return;
      said.current.add(key);
      toast.show(copy.requiredAfterGame, { variant: 'warning' });
    }
  }, [copy, deferred, inSession, mandatory, phase, toast, version]);

  return null;
}
