import { useState, type FormEvent } from 'react';
import './style/JoinForm.css';

interface JoinFormProps {
  onJoin: (name: string, roomId: string) => void;
}

export default function JoinForm({ onJoin }: JoinFormProps) {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const room = roomId.trim().toUpperCase() || 'LOBBY';
    onJoin(trimmedName, room);
  };

  return (
    <section className="join">
      <form className="join__card" onSubmit={handleSubmit}>
        <h1 className="join__title">Monopoly</h1>
        <p className="join__subtitle">Join a room to play. Share the room code with friends to play together.</p>

        <label className="join__label" htmlFor="join-name">Your name</label>
        <input
          id="join-name"
          className="join__input"
          type="text"
          value={name}
          maxLength={20}
          placeholder="e.g. Marcin"
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        <label className="join__label" htmlFor="join-room">Room code</label>
        <input
          id="join-room"
          className="join__input"
          type="text"
          value={roomId}
          maxLength={20}
          placeholder="e.g. GAME-1234 (blank joins LOBBY)"
          onChange={e => setRoomId(e.target.value)}
        />

        <button className="join__button" type="submit" disabled={!name.trim()}>
          Join game
        </button>
      </form>
    </section>
  );
}
