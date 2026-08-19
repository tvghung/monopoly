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

    expect(screen.getByRole('button', { name: 'Hủy sẵn sàng' }).querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    const startButton = screen.getByRole('button', { name: 'Bắt đầu' });
    expect(startButton.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(startButton);
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

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu' }).disabled).toBe(true);
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

    expect(screen.queryByRole('button', { name: 'Bắt đầu' })).toBeNull();
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
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Xanh dương' }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đỏ' }).disabled).toBe(false);
    expect(screen.queryByText('Xem trước trong phòng')).toBeNull();
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
    expect(onSetAppearance).toHaveBeenLastCalledWith({ characterId: 'capybara', color: 'green' });
  });

  it('keeps the start action available when colors or mascots repeat separately', () => {
    const onStart = vi.fn();
    render(
      <Lobby
        roomCode="ROOM-6"
        players={[
          { ...readyPlayers[0], color: 'red', characterId: 'dog' },
          { ...readyPlayers[1], color: 'red', characterId: 'panda' },
        ]}
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

    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('keeps the start action available when the same mascot uses different colors', () => {
    const onStart = vi.fn();
    render(
      <Lobby
        roomCode="ROOM-7"
        players={[
          { ...readyPlayers[0], color: 'red', characterId: 'dog' },
          { ...readyPlayers[1], color: 'blue', characterId: 'dog' },
        ]}
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

    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('keeps the start action disabled for an exact duplicate appearance', () => {
    render(
      <Lobby
        roomCode="ROOM-8"
        players={[
          { ...readyPlayers[0], color: 'red', characterId: 'dog' },
          { ...readyPlayers[1], color: 'red', characterId: 'dog' },
        ]}
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

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu' }).disabled).toBe(true);
  });

  it('browses a conflicting mascot before atomically committing a valid color', () => {
    const onSetAppearance = vi.fn();
    render(
      <Lobby
        roomCode="ROOM-9"
        players={[
          { id: 'player-a', name: 'Ada', color: 'blue', characterId: 'panda', ready: true, connected: true },
          { id: 'player-b', name: 'Grace', color: 'blue', characterId: 'dog', ready: true, connected: true },
        ]}
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

    fireEvent.click(screen.getByRole('button', { name: 'Dog' }));
    expect(onSetAppearance).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: /Mascot đang xem: Dog/u })).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Xanh dương \(đã dùng với Dog\)/u })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: 'Đỏ' }));
    expect(onSetAppearance).toHaveBeenCalledWith({ characterId: 'dog', color: 'red' });
  });
});
