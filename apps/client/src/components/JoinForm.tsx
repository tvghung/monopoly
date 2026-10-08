import { useState, type FormEvent } from 'react';
import Button from '../design-system/components/Button/Button';
import Panel from '../design-system/components/Panel/Panel';
import SegmentedControl, { type SegmentedOption } from '../design-system/components/SegmentedControl/SegmentedControl';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import HowToPlayButton from '../howToPlay/HowToPlayButton';
import JoinHero from './JoinHero';
import './style/EntryShared.css';
import './style/JoinForm.css';
import { useTranslation } from '../i18n/I18n';

/** `code` joins the room whose code is typed; `public` joins the shared public room. */
export type JoinRoomMode = 'code' | 'public';

/** The room both "Phòng chung" and an empty code join. */
const PUBLIC_ROOM_CODE = 'LOBBY';

interface JoinFormProps {
  onJoin: (name: string, roomId: string) => void;
  /**
   * Takes the player back to the screen before this one (the desktop app's "Chơi qua mạng LAN"). Given only where such a
   * screen exists: in a plain browser this is the first screen, and there is no button.
   */
  onBack?: () => void;
  busy: boolean;
  connected: boolean;
  error: string | null;
  /** What the player already typed on the screen before (the desktop launcher), so they never type it twice. */
  initialName?: string;
  initialRoomCode?: string;
  /** Starting mode for design-lab captures; an `initialRoomCode` from an invitation link always selects `code`. */
  initialMode?: JoinRoomMode;
}

export default function JoinForm({
  onJoin, onBack, busy, connected, error, initialName, initialRoomCode, initialMode = 'code',
}: JoinFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName ?? '');
  const [roomId, setRoomId] = useState(initialRoomCode ?? '');
  const [mode, setMode] = useState<JoinRoomMode>(initialRoomCode ? 'code' : initialMode);
  const missingName = !name.trim();
  const roomModeOptions: readonly SegmentedOption<JoinRoomMode>[] = [
    { value: 'code', label: t('join.modeCode') },
    { value: 'public', label: t('join.modePublic') },
  ];

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const typedCode = roomId.trim().toUpperCase();
    const room = mode === 'public' ? PUBLIC_ROOM_CODE : typedCode || PUBLIC_ROOM_CODE;
    onJoin(trimmedName, room);
  };

  return (
    <section className="join" aria-labelledby="join-title">
      <div className="join__layout">
        <div className="join__hero">
          {/* First on the page, like the back key of a browser: the card keeps every field and its button on screen at 812x375. */}
          {onBack ? (
            <Button
              variant="ghost"
              className="join__back"
              icon={<ActionIcon name="back" className="action-icon--only" />}
              onClick={() => onBack()}
            >
              {t('join.back')}
            </Button>
          ) : null}
          <p className="join__brand" aria-hidden="true">OWN THE BLOCK</p>
          <h1 id="join-title" className="join__title">{t('brand.subtitle')}</h1>
          <JoinHero />
          {/* Beside the title, not in the card: the card keeps every field and the join button on screen at 812x375. */}
          <HowToPlayButton variant="labelled" className="join__help" />
        </div>

        <Panel as="div" padding="lg" className="join__panel">
          <form className="join__form" onSubmit={handleSubmit}>
            {error ? <p className="join__error" role="alert">{error}</p> : null}
            {!connected ? <p className="join__connection" role="status">{t('join.connecting')}</p> : null}

            <div className="join__field">
              <label className="entry-label" htmlFor="join-name">{t('join.name')}</label>
              <input
                id="join-name"
                className="entry-control"
                type="text"
                value={name}
                maxLength={20}
                placeholder={t('join.namePlaceholder')}
                onChange={e => setName(e.target.value)}
                autoComplete="nickname"
                enterKeyHint={mode === 'code' ? 'next' : 'go'}
                autoFocus
              />
            </div>

            <div className="join__field">
              <span className="entry-label" aria-hidden="true">{t('join.roomType')}</span>
              <SegmentedControl
                label={t('join.roomType')}
                options={roomModeOptions}
                value={mode}
                onChange={setMode}
                className="join__modes"
              />
            </div>

            {mode === 'code' ? (
              <div className="join__field join__room">
                <label className="entry-label" htmlFor="join-room">{t('join.roomCode')}</label>
                <input
                  id="join-room"
                  className="entry-control"
                  type="text"
                  value={roomId}
                  maxLength={20}
                  placeholder={t('join.roomCodePlaceholder')}
                  onChange={e => setRoomId(e.target.value)}
                  autoCapitalize="characters"
                  enterKeyHint="go"
                />
              </div>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="join__submit"
              icon={busy ? undefined : <ActionIcon name="join" className="action-icon--only" />}
              busy={busy}
              disabled={missingName || !connected}
              aria-describedby={missingName && !busy ? 'join-submit-reason' : undefined}
            >
              {busy ? t('join.entering') : t('join.enter')}
            </Button>
            {missingName && !busy ? (
              // Not drawn (the empty name field says it); it still tells assistive technology why the button is off.
              <p id="join-submit-reason" className="sr-only">{t('join.nameHint')}</p>
            ) : null}
          </form>
        </Panel>
      </div>
    </section>
  );
}
