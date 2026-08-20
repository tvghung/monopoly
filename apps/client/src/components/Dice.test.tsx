import { act, cleanup, render } from '@testing-library/react';
import type { GameSettings } from '../settings/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../internal';
import type { SocketFunctions, StateContextValue } from '../types';
import settingsContext from '../settings/SettingsContext';
import { PresentationController } from '../game/presentation/PresentationController';
import { PresentationProvider } from '../game/presentation/PresentationProvider';
import { cloneRoom, makeRoom } from '../game/presentation/testFixtures';
import Dice from './Dice';

afterEach(cleanup);

const settings: GameSettings = {
  version: 1,
  masterVolume: 1,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  animationSpeed: 1,
  reducedMotion: false,
  fullscreen: false,
};

const makeSocketFunctions = (): SocketFunctions => ({
  rollDice: vi.fn(),
  buyProperty: vi.fn(),
  sendChat: vi.fn(),
  makeOffer: vi.fn(),
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  sellHouse: vi.fn(),
  payBail: vi.fn(),
  useJailCard: vi.fn(),
});

function renderDice(
  controller: PresentationController,
  gameState: StateContextValue['state'],
  reducedMotion = false,
) {
  const value: StateContextValue = {
    state: gameState,
    socketFunctions: makeSocketFunctions(),
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
  };
  const contextSettings = {
    settings: { ...settings, reducedMotion },
    updateSettings: vi.fn(),
    resetSettings: vi.fn(),
  };
  return render(
    <settingsContext.Provider value={contextSettings}>
      <stateContext.Provider value={value}>
        <PresentationProvider controller={controller}>
          <Dice />
        </PresentationProvider>
      </stateContext.Provider>
    </settingsContext.Provider>,
  );
}

async function acceptLiveRoll(
  controller: PresentationController,
  room: ReturnType<typeof makeRoom>,
  rollSequence: number,
): Promise<void> {
  const live = cloneRoom(room, room.version + 1);
  live.gameState.boardState.diceValue = { dice1: 2, dice2: 2 };
  live.gameState.boardState.rollSequence = rollSequence;
  await act(async () => {
    controller.acceptRoomSnapshot(live, 'LIVE_UPDATE');
    await controller.queue.whenIdle();
  });
}

function firstCubeTransform(container: HTMLElement): string {
  return container.querySelector<HTMLElement>('.die__cube')?.style.transform ?? '';
}

describe('Dice presentation identity', () => {
  it('tumbles identical faces for a new sequence and does not replay after reset', async () => {
    const room = makeRoom();
    const controller = new PresentationController();
    const view = renderDice(controller, room.gameState);
    act(() => {
      controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    });

    await acceptLiveRoll(controller, room, 1);
    const firstRollTransform = firstCubeTransform(view.container);
    expect(firstRollTransform).toContain('360deg');
    expect(controller.getState().displayRollSequence).toBe(1);

    const reconnect = cloneRoom(room, 3);
    reconnect.gameState.boardState.diceValue = { dice1: 2, dice2: 2 };
    reconnect.gameState.boardState.rollSequence = 1;
    act(() => {
      controller.acceptRoomSnapshot(reconnect, 'SESSION_SYNC');
    });
    expect(firstCubeTransform(view.container)).toBe(firstRollTransform);

    await acceptLiveRoll(controller, reconnect, 2);
    expect(firstCubeTransform(view.container)).not.toBe(firstRollTransform);
  });

  it('settles the identified roll without extra motion when reduced motion is enabled', async () => {
    const room = makeRoom();
    const controller = new PresentationController(true);
    const view = renderDice(controller, room.gameState, true);
    act(() => {
      controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    });

    await acceptLiveRoll(controller, room, 1);

    const cube = view.container.querySelector<HTMLElement>('.die__cube');
    expect(cube?.style.transition).toBe('none');
    expect(cube?.style.transform).not.toContain('360deg');
    expect(controller.getState().displayRollSequence).toBe(1);
  });
});
