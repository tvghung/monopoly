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

    fireEvent.click(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(screen.getByText('Ada (you)')).toBeTruthy();
    expect(screen.getByText('Host')).toBeTruthy();
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

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start game' }).disabled).toBe(true);
    expect(screen.getByText('Offline')).toBeTruthy();
    expect(screen.getAllByText('Not ready').length).toBeGreaterThanOrEqual(1);
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

    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
    expect(screen.getByText(/Waiting for the host/)).toBeTruthy();
  });
});
