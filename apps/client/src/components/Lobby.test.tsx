import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import Lobby from './Lobby';

afterEach(cleanup);

const readyPlayers = [
  { id: 'player-a', name: 'Ada', color: 'red' as const, characterId: 'dog' as const, ready: true, connected: true },
  { id: 'player-b', name: 'Grace', color: 'blue' as const, characterId: 'panda' as const, ready: true, connected: true },
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
        maxPlayers={4}
        busy={false}
        error={null}
        onSetReady={vi.fn()}
        onSetAppearance={vi.fn()}
        onStart={onStart}
        onLeave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu ván chơi' }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(screen.getByText('Ada (bạn)')).toBeTruthy();
    expect(screen.getByText('Chủ phòng')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText(/2-4 người chơi/)).toBeTruthy();
  });

  it('keeps start disabled while a player is offline or not ready', () => {
    render(
      <Lobby
        roomCode="ROOM-2"
        players={[readyPlayers[0], { ...readyPlayers[1], connected: false, ready: false }]}
        playerId="player-a"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={4}
        busy={false}
        error={null}
        onSetReady={vi.fn()}
        onSetAppearance={vi.fn()}
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
        maxPlayers={4}
        busy={false}
        error={null}
        onSetReady={vi.fn()}
        onSetAppearance={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Bắt đầu ván chơi' })).toBeNull();
    expect(screen.getByText(/Đang chờ Chủ Phòng/)).toBeTruthy();
  });

  it('shows the selected mascot and exposes appearance controls', () => {
    render(
      <Lobby
        roomCode="ROOM-4"
        players={readyPlayers}
        playerId="player-a"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={4}
        busy={false}
        error={null}
        onSetReady={vi.fn()}
        onSetAppearance={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Dog').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Panda').length).toBeGreaterThanOrEqual(1);
    const characterGroup = screen.getByRole('group', { name: 'Chọn mascot' });
    const colorGroup = screen.getByRole('group', { name: 'Chọn màu người chơi' });
    expect(characterGroup.querySelectorAll('button')).toHaveLength(8);
    expect(colorGroup.querySelectorAll('button')).toHaveLength(10);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Panda' }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Xanh dương \(đã được chọn\)/u }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đỏ' }).disabled).toBe(false);
    expect(document.querySelector<HTMLImageElement>('.lobby-player__mascot')?.src)
      .toContain('%23f2384a');
  });

  it('supports carousel keyboard navigation and keeps color selection in the same appearance flow', () => {
    const onSetAppearance = vi.fn();
    render(
      <Lobby
        roomCode="ROOM-5"
        players={readyPlayers}
        playerId="player-a"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={4}
        busy={false}
        error={null}
        onSetReady={vi.fn()}
        onSetAppearance={onSetAppearance}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    const stage = screen.getByRole('group', { name: /Mascot đang xem: Dog/u });
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    expect(onSetAppearance).toHaveBeenCalledWith({ characterId: 'capybara' });
    expect(screen.getByRole('button', { name: 'Dog' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Xanh lá' }));
    expect(onSetAppearance).toHaveBeenLastCalledWith({ color: 'green' });
  });
});
