import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SOCKET_PROTOCOL_VERSION, type Ack } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { PresentationController } from '../../presentation/PresentationController';
import { PresentationProvider } from '../../presentation/PresentationProvider';
import { makeRoom } from '../../presentation/testFixtures';
import CardInteractionOverlay from './CardInteractionOverlay';

afterEach(cleanup);

function socketFunctions(overrides: Partial<SocketFunctions> = {}): SocketFunctions {
  const success = (): Promise<Ack> => Promise.resolve({
    ok: true,
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    revision: 1,
  });
  return {
    rollDice: vi.fn(),
    buyProperty: vi.fn(),
    doNotBuy: vi.fn(),
    dismissCard: vi.fn(success),
    sendChat: vi.fn(),
    makeOffer: vi.fn(),
    acceptOffer: vi.fn(),
    declineOffer: vi.fn(),
    sellHouse: vi.fn(),
    payBail: vi.fn(),
    useJailCard: vi.fn(),
    ...overrides,
  };
}

function revealedRoom() {
  const room = makeRoom();
  room.gameState.players['player-a'].currentTile = 7;
  room.gameState.turnInfo.pendingCardInteraction = {
    operationId: 'revealed-card', playerId: 'player-a', turnNumber: 1, deck: 'chance', sourceTile: 7,
    stage: 'REVEALED', revealedCardId: 'chance-dividend',
    continuation: { playerId: 'player-a', turnNumber: 1 }, deadlineAt: '2030-01-01T00:00:30.000Z',
  };
  return room;
}

function renderOverlay(
  controller: PresentationController,
  room: ReturnType<typeof makeRoom>,
  options: Partial<StateContextValue> = {},
) {
  const contextValue: StateContextValue = {
    state: room.gameState,
    socketFunctions: socketFunctions(),
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
    ...options,
  };
  return render(
    <PresentationProvider controller={controller}>
      <stateContext.Provider value={contextValue}>
        <CardInteractionOverlay />
      </stateContext.Provider>
    </PresentationProvider>,
  );
}

describe('CardInteractionOverlay', () => {
  it('shows the authoritative artwork, title, message, and one visible close action', () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    renderOverlay(controller, room);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Cổ tức')).toBeTruthy();
    expect(screen.getByText('Nhận cổ tức 50.000 ₫.')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('src')).toContain('/art/cards/chance/');
    expect(screen.getAllByRole('button', { name: 'Đóng' })).toHaveLength(1);
    expect(screen.queryByText('Nhấn vào thẻ để xem')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đóng thẻ' })).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
    controller.dispose();
  });

  it('sends dismiss once, disables immediately, and keeps the modal until the authoritative clear', async () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    let resolve: ((ack: Ack) => void) | undefined;
    const dismissCard = vi.fn(() => new Promise<Ack>(res => { resolve = res; }));
    const view = renderOverlay(controller, room, { socketFunctions: socketFunctions({ dismissCard }) });
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Đóng' });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(dismissCard).toHaveBeenCalledTimes(1);
    expect(dismissCard).toHaveBeenCalledWith('revealed-card');
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('dialog')).toBeTruthy();

    await act(async () => {
      resolve?.({ ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, revision: 2 });
      await Promise.resolve();
    });
    expect(screen.getByRole('dialog')).toBeTruthy();

    view.rerender(
      <PresentationProvider controller={controller}>
        <stateContext.Provider value={{
          ...({
            state: { ...room.gameState, turnInfo: {} },
            socketFunctions: socketFunctions({ dismissCard }),
            playerId: 'player-a', role: 'PLAYER', connected: true, canMutate: true,
            privatePlayerState: null, privateOffers: [], roomPlayers: room.players,
          } satisfies StateContextValue),
        }}>
          <CardInteractionOverlay />
        </stateContext.Provider>
      </PresentationProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    controller.dispose();
  });

  it('shows an inline failure and re-enables close without pretending the card resolved', async () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const dismissCard = vi.fn(() => Promise.resolve({
      ok: false as const,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      error: { code: 'CONFLICT' as const, message: 'retry', retryable: true },
    }));
    renderOverlay(controller, room, { socketFunctions: socketFunctions({ dismissCard }) });
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Đóng' });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(button.disabled).toBe(false);
    expect(screen.getByRole('dialog')).toBeTruthy();
    controller.dispose();
  });

  it('keeps the close action unavailable to spectators and ignores escape, backdrop, and panel clicks', () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const dismissCard = vi.fn();
    renderOverlay(controller, room, {
      playerId: null, role: 'SPECTATOR', canMutate: false,
      socketFunctions: socketFunctions({ dismissCard }),
    });
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Đóng' });
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Đang chờ người chơi đóng thẻ')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerDown(screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('dialog'));
    expect(dismissCard).not.toHaveBeenCalled();
    controller.dispose();
  });
});
