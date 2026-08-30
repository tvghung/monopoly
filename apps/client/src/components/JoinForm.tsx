import { useState, type FormEvent } from 'react';
import './style/JoinForm.css';

interface JoinFormProps {
  onJoin: (name: string, roomId: string) => void;
  busy: boolean;
  connected: boolean;
  error: string | null;
  initialRoomCode?: string;
}

export default function JoinForm({
  onJoin, busy, connected, error, initialRoomCode,
}: JoinFormProps) {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState(initialRoomCode ?? '');

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const room = roomId.trim().toUpperCase() || 'LOBBY';
    onJoin(trimmedName, room);
  };

  return (
    <section className="join" aria-labelledby="join-title">
      <form className="join__card" onSubmit={handleSubmit}>
        <p className="join__brand" aria-hidden="true">OWN THE BLOCK</p>
        <h1 id="join-title" className="join__title">Cờ Tỷ Phú Việt Nam</h1>
        <p className="join__subtitle">Vào phòng và chia sẻ mã phòng để cùng bạn bè chơi trực tuyến.</p>

        {error ? <p className="join__error" role="alert">{error}</p> : null}
        {!connected ? <p className="join__connection" role="status">Đang kết nối đến máy chủ trò chơi…</p> : null}

        <label className="join__label" htmlFor="join-name">Tên của bạn</label>
        <input
          id="join-name"
          className="join__input"
          type="text"
          value={name}
          maxLength={20}
          placeholder="Ví dụ: Minh"
          onChange={e => setName(e.target.value)}
          autoComplete="nickname"
          enterKeyHint="next"
          autoFocus
        />

        <label className="join__label" htmlFor="join-room">Mã phòng</label>
        <input
          id="join-room"
          className="join__input"
          type="text"
          value={roomId}
          maxLength={20}
          placeholder="Ví dụ: GAME-1234 (để trống để vào phòng chung)"
          onChange={e => setRoomId(e.target.value)}
          autoCapitalize="characters"
          enterKeyHint="go"
        />

        <button className="join__button" type="submit" disabled={!name.trim() || busy || !connected}>
          {busy ? 'Đang vào phòng…' : 'Vào phòng'}
        </button>
      </form>
    </section>
  );
}
