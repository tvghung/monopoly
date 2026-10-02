import { useState, type FormEvent } from 'react';
import Button from '../design-system/components/Button/Button';
import Panel from '../design-system/components/Panel/Panel';
import SegmentedControl, { type SegmentedOption } from '../design-system/components/SegmentedControl/SegmentedControl';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import JoinHero from './JoinHero';
import './style/EntryShared.css';
import './style/JoinForm.css';

/** `code` joins the room whose code is typed; `public` joins the shared public room. */
export type JoinRoomMode = 'code' | 'public';

/** The room both "Phòng chung" and an empty code join. */
const PUBLIC_ROOM_CODE = 'LOBBY';

const ROOM_MODE_OPTIONS: readonly SegmentedOption<JoinRoomMode>[] = [
  { value: 'code', label: 'Có mã phòng' },
  { value: 'public', label: 'Phòng chung' },
];

interface JoinFormProps {
  onJoin: (name: string, roomId: string) => void;
  busy: boolean;
  connected: boolean;
  error: string | null;
  initialRoomCode?: string;
  /** Starting mode for design-lab captures; an `initialRoomCode` from an invitation link always selects `code`. */
  initialMode?: JoinRoomMode;
}

export default function JoinForm({
  onJoin, busy, connected, error, initialRoomCode, initialMode = 'code',
}: JoinFormProps) {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState(initialRoomCode ?? '');
  const [mode, setMode] = useState<JoinRoomMode>(initialRoomCode ? 'code' : initialMode);
  const missingName = !name.trim();

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
          <p className="join__brand" aria-hidden="true">OWN THE BLOCK</p>
          <h1 id="join-title" className="join__title">Cờ Tỷ Phú Việt Nam</h1>
          <p className="join__subtitle">Vào phòng và chia sẻ mã phòng để cùng bạn bè chơi trực tuyến.</p>
          <JoinHero />
        </div>

        <Panel as="div" padding="lg" className="join__panel">
          <form className="join__form" onSubmit={handleSubmit}>
            {error ? <p className="join__error" role="alert">{error}</p> : null}
            {!connected ? <p className="join__connection" role="status">Đang kết nối đến máy chủ trò chơi…</p> : null}

            <div className="join__field">
              <label className="entry-label" htmlFor="join-name">Tên của bạn</label>
              <input
                id="join-name"
                className="entry-control"
                type="text"
                value={name}
                maxLength={20}
                placeholder="Ví dụ: Minh"
                onChange={e => setName(e.target.value)}
                autoComplete="nickname"
                enterKeyHint={mode === 'code' ? 'next' : 'go'}
                autoFocus
              />
            </div>

            <div className="join__field">
              <span className="entry-label" aria-hidden="true">Loại phòng</span>
              <SegmentedControl
                label="Loại phòng"
                options={ROOM_MODE_OPTIONS}
                value={mode}
                onChange={setMode}
                className="join__modes"
              />
            </div>

            {mode === 'code' ? (
              <div className="join__field join__room">
                <label className="entry-label" htmlFor="join-room">Mã phòng</label>
                <input
                  id="join-room"
                  className="entry-control"
                  type="text"
                  value={roomId}
                  maxLength={20}
                  placeholder="Ví dụ: GAME-1234"
                  onChange={e => setRoomId(e.target.value)}
                  autoCapitalize="characters"
                  enterKeyHint="go"
                />
              </div>
            ) : (
              <p className="join__hint join__room">Mọi người chọn Phòng chung đều vào cùng một phòng.</p>
            )}

            <Button
              type="submit"
              size="lg"
              className="join__submit"
              icon={busy ? undefined : <ActionIcon name="join" className="action-icon--only" />}
              busy={busy}
              disabled={missingName || !connected}
              aria-describedby={missingName && !busy ? 'join-submit-reason' : undefined}
            >
              {busy ? 'Đang vào phòng…' : 'Vào phòng'}
            </Button>
            {missingName && !busy ? (
              <p id="join-submit-reason" className="join__hint join__reason">Nhập tên của bạn để vào phòng.</p>
            ) : null}
          </form>
        </Panel>
      </div>
    </section>
  );
}
