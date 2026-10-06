import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import stateContext from '../../internal';
import type { StateContextValue } from '../../types';
import { makeRoom, makeTeamRoom } from '../presentation/testFixtures';
import TeamChip from './TeamChip';

afterEach(cleanup);

function renderChip(room: ReturnType<typeof makeRoom>, playerId: string, viewerId: string | null = 'player-a') {
  const value = {
    state: room.gameState,
    playerId: viewerId,
    role: viewerId ? 'PLAYER' : 'SPECTATOR',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    socketFunctions: {},
  } as unknown as StateContextValue;
  return render(
    <stateContext.Provider value={value}>
      <TeamChip playerId={playerId} />
    </stateContext.Provider>,
  );
}

describe('TeamChip', () => {
  it('names the team and the relation to the viewer', () => {
    expect(renderChip(makeTeamRoom(), 'player-c').container.textContent).toBe('Đội Team 1 · Đồng đội');
    cleanup();
    expect(renderChip(makeTeamRoom(), 'player-d').container.textContent).toBe('Đội Team 2 · Đối thủ');
    cleanup();
    expect(renderChip(makeTeamRoom(), 'player-a').container.textContent).toBe('Đội Team 1');
  });

  it('names only the team to a spectator', () => {
    expect(renderChip(makeTeamRoom(), 'player-d', null).container.textContent).toBe('Đội Team 2');
  });

  it('renders nothing in a Solo game', () => {
    expect(renderChip(makeRoom(), 'player-b').container.textContent).toBe('');
  });
});
