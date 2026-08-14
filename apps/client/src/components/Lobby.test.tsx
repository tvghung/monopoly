import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import Lobby from './Lobby';

afterEach(cleanup);

const readyPlayers = [
  { id: 'player-a', name: 'Ada', color: 'red', ready: true, connected: true },
  { id: 'player-b', name: 'Grace', color: 'blue', ready: true, connected: true },
];

describe('Lobby', () => {
  it('lets a ready host start a valid lobby', () => {
    const onStart = vi.fn();
    render(
      <Lobby
        roomCode="ROOM-1"
        players={readyPlayers}
        playerId="player-a"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={7}
        busy={false}
        error={null}
        onSetReady={vi.fn()}
        onStart={onStart}
        onLeave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu ván chơi' }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(screen.getByText('Ada (bạn)')).toBeTruthy();
    expect(screen.getByText('Chủ phòng')).toBeTruthy();
  });

  it('keeps start disabled while a player is offline or not ready', () => {
    render(
      <Lobby
        roomCode="ROOM-2"
        players={[readyPlayers[0], { ...readyPlayers[1], connected: false, ready: false }]}
        playerId="player-a"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={7}
        busy={false}
        error={null}
        onSetReady={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu ván chơi' }).disabled).toBe(true);
    expect(screen.getByText('Mất kết nối')).toBeTruthy();
    expect(screen.getAllByText('Chưa sẵn sàng').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render a start action for a non-host', () => {
    render(
      <Lobby
        roomCode="ROOM-3"
        players={readyPlayers}
        playerId="player-b"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={7}
        busy={false}
        error={null}
        onSetReady={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Bắt đầu ván chơi' })).toBeNull();
    expect(screen.getByText(/Đang chờ Chủ Phòng/)).toBeTruthy();
  });

  it('shows a character placeholder without adding server character state', () => {
    render(
      <Lobby
        roomCode="ROOM-4"
        players={readyPlayers}
        playerId="player-a"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={7}
        busy={false}
        error={null}
        onSetReady={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Nhân vật: Sắp ra mắt')).toHaveLength(2);
  });
});
