import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { allGameCards, SOCKET_PROTOCOL_VERSION, type Ack, type CardDeck, type GameCardId } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmationDialog from '../../../design-system/components/ConfirmationDialog/ConfirmationDialog';
import stateContext from '../../../internal';
import { DEFAULT_GAME_SETTINGS } from '../../../settings/defaults';
import { SettingsProvider } from '../../../settings/SettingsProvider';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { PresentationController } from '../../presentation/PresentationController';
import { PresentationProvider } from '../../presentation/PresentationProvider';
import { makeRoom } from '../../presentation/testFixtures';
import CardInteractionOverlay from './CardInteractionOverlay';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

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

function revealedRoom(cardId: GameCardId = 'chance-dividend', deck: CardDeck = 'chance', deadlineAt = '2030-01-01T00:00:30.000Z') {
  const room = makeRoom();
  room.gameState.players['player-a'].currentTile = 7;
  room.gameState.turnInfo.pendingCardInteraction = {
    operationId: 'revealed-card', playerId: 'player-a', turnNumber: 1, deck, sourceTile: 7,
    stage: 'REVEALED', revealedCardId: cardId,
    continuation: { playerId: 'player-a', turnNumber: 1 }, deadlineAt,
  };
  return room;
}

function contextFor(room: ReturnType<typeof makeRoom>, options: Partial<StateContextValue> = {}): StateContextValue {
  return {
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
}

function renderOverlay(
  controller: PresentationController,
  room: ReturnType<typeof makeRoom>,
  options: Partial<StateContextValue> = {},
) {
  return render(
    <PresentationProvider controller={controller}>
      <stateContext.Provider value={contextFor(room, options)}>
        <CardInteractionOverlay />
      </stateContext.Provider>
    </PresentationProvider>,
  );
}

const closeButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Đóng' });

/** The artwork file in `public/`. The URL is built from a variable so Vite leaves it alone instead of turning it into an asset reference. */
const artworkFile = (deck: CardDeck, id: GameCardId): string => {
  const path = `../../../../public/art/cards/${deck}/${id}.svg`;
  return fileURLToPath(new URL(path, import.meta.url));
};

describe('CardInteractionOverlay', () => {
  it('shows the authoritative artwork, title, deck badge, message, and one visible close action', () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    renderOverlay(controller, room);

    expect(screen.getByRole('dialog', { name: 'Cổ tức' })).toBeTruthy();
    expect(screen.getByText('Cổ tức')).toBeTruthy();
    expect(screen.getByText('CƠ HỘI')).toBeTruthy();
    expect(screen.getByText('Nhận cổ tức 50.000 ₫.')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('src')).toContain('/art/cards/chance/');
    expect(screen.getAllByRole('button', { name: 'Đóng' })).toHaveLength(1);
    expect(screen.queryByText('Nhấn vào thẻ để xem')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đóng thẻ' })).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
    controller.dispose();
  });

  it('labels the Khí Vận deck with its own badge and artwork folder', () => {
    const controller = new PresentationController();
    const room = revealedRoom('chest-inheritance', 'chest');
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    renderOverlay(controller, room);

    expect(screen.getByText('KHÍ VẬN')).toBeTruthy();
    expect(screen.queryByText('CƠ HỘI')).toBeNull();
    expect(screen.getByRole('img').getAttribute('src')).toContain('/art/cards/chest/chest-inheritance.svg');
    expect(screen.getByRole('dialog').className).toContain('card-face--chest');
    controller.dispose();
  });

  it('renders all 28 cards with their real artwork, deck badge, title, message, and exactly one close button', () => {
    expect(allGameCards).toHaveLength(28);
    for (const card of allGameCards) {
      const controller = new PresentationController();
      const room = revealedRoom(card.id, card.sourceDeck);
      controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
      const view = renderOverlay(controller, room);

      const dialog = screen.getByRole('dialog');
      const title = dialog.querySelector('h2')?.textContent ?? '';
      expect(title.length, card.id).toBeGreaterThan(0);
      expect(screen.getByText(card.sourceDeck === 'chance' ? 'CƠ HỘI' : 'KHÍ VẬN'), card.id).toBeTruthy();
      expect(screen.getByText(card.message), card.id).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Đóng' }), card.id).toHaveLength(1);
      expect(dialog.getAttribute('aria-labelledby'), card.id).toBe(dialog.querySelector('h2')?.id);

      const src = screen.getByRole('img', { name: `${title} — minh họa` }).getAttribute('src') ?? '';
      expect(src, card.id).toContain(`/art/cards/${card.sourceDeck}/${card.id}.svg`);
      expect(existsSync(artworkFile(card.sourceDeck, card.id)), card.id).toBe(true);

      view.unmount();
      controller.dispose();
    }
  });

  it('is a card-layer dialog with no close control, the stage attribute, and its message as the description', () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    renderOverlay(controller, room);

    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement?.className).toContain('ds-modal__overlay--card');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('.ds-modal__close')).toBeNull();
    const stage = screen.getByTestId('card-interaction-overlay');
    expect(stage.getAttribute('data-card-stage')).toBe('REVEALED');
    expect(dialog.contains(stage)).toBe(true);
    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe('Nhận cổ tức 50.000 ₫.');
    controller.dispose();
  });

  it('sends dismiss once, disables immediately, and keeps the modal until the authoritative clear', async () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    let resolve: ((ack: Ack) => void) | undefined;
    const dismissCard = vi.fn(() => new Promise<Ack>(res => { resolve = res; }));
    const view = renderOverlay(controller, room, { socketFunctions: socketFunctions({ dismissCard }) });
    const button = closeButton();

    fireEvent.click(button);
    fireEvent.click(button);
    expect(dismissCard).toHaveBeenCalledTimes(1);
    expect(dismissCard).toHaveBeenCalledWith('revealed-card');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('dialog')).toBeTruthy();

    await act(async () => {
      resolve?.({ ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, revision: 2 });
      await Promise.resolve();
    });
    expect(screen.getByRole('dialog')).toBeTruthy();

    view.rerender(
      <PresentationProvider controller={controller}>
        <stateContext.Provider value={contextFor(
          { ...room, gameState: { ...room.gameState, turnInfo: {} } },
          { socketFunctions: socketFunctions({ dismissCard }) },
        )}>
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
    const button = closeButton();

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
    const button = closeButton();
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Đang chờ người chơi đóng thẻ')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerDown(screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('dialog'));
    fireEvent.click(button);
    expect(dismissCard).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    controller.dispose();
  });

  it('keeps the close action unavailable to a seated player who is not the acting player', () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const dismissCard = vi.fn();
    renderOverlay(controller, room, { playerId: 'player-b', socketFunctions: socketFunctions({ dismissCard }) });
    const button = closeButton();

    expect(button.disabled).toBe(true);
    expect(button.hasAttribute('data-modal-autofocus')).toBe(false);
    expect(screen.getByText('Đang chờ người chơi đóng thẻ')).toBeTruthy();
    fireEvent.click(button);
    expect(dismissCard).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('does not close on Escape or a backdrop press, even for the acting player', () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const dismissCard = vi.fn();
    renderOverlay(controller, room, { socketFunctions: socketFunctions({ dismissCard }) });
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement as HTMLElement;

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(dismissCard).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBe(dialog);
    controller.dispose();
  });

  it('puts focus on the close button for the acting player and on the dialog for everyone else', () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const actor = renderOverlay(controller, room);
    expect(closeButton().hasAttribute('data-modal-autofocus')).toBe(true);
    expect(document.activeElement).toBe(closeButton());
    actor.unmount();

    renderOverlay(controller, room, { playerId: 'player-b' });
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    controller.dispose();
  });

  it('waits indefinitely and survives a reconnect: the card stays, and close follows the connection', () => {
    const controller = new PresentationController();
    const room = revealedRoom('chance-dividend', 'chance', '2000-01-01T00:00:00.000Z');
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const dismissCard = vi.fn();
    const sockets = socketFunctions({ dismissCard });
    const view = renderOverlay(controller, room, { socketFunctions: sockets });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(closeButton().disabled).toBe(false);
    expect(dismissCard).not.toHaveBeenCalled();

    const rerender = (options: Partial<StateContextValue>) => view.rerender(
      <PresentationProvider controller={controller}>
        <stateContext.Provider value={contextFor(room, { socketFunctions: sockets, ...options })}>
          <CardInteractionOverlay />
        </stateContext.Provider>
      </PresentationProvider>,
    );
    rerender({ connected: false });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(closeButton().disabled).toBe(true);
    expect(screen.getByText('Đang chờ người chơi đóng thẻ')).toBeTruthy();

    rerender({ connected: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(closeButton().disabled).toBe(false);
    expect(dismissCard).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('gives the card a plain fade under reduced motion and the tilted entrance otherwise', () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const plain = renderOverlay(controller, room);
    expect(screen.getByRole('dialog').className).not.toContain('card-modal--reduced-motion');
    plain.unmount();

    render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion: true }}>
        <PresentationProvider controller={controller}>
          <stateContext.Provider value={contextFor(room)}>
            <CardInteractionOverlay />
          </stateContext.Provider>
        </PresentationProvider>
      </SettingsProvider>,
    );
    expect(screen.getByRole('dialog').className).toContain('card-modal--reduced-motion');
    controller.dispose();
  });

  it('also fades only when the operating system asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    renderOverlay(controller, room);

    expect(screen.getByRole('dialog').className).toContain('card-modal--reduced-motion');
    controller.dispose();
  });

  it('lets a confirmation open above the card: Escape reaches only the confirmation', () => {
    const controller = new PresentationController();
    const room = revealedRoom();
    controller.acceptRoomSnapshot(room, 'SESSION_SYNC');
    const dismissCard = vi.fn();
    const onCancel = vi.fn();
    render(
      <PresentationProvider controller={controller}>
        <stateContext.Provider value={contextFor(room, { socketFunctions: socketFunctions({ dismissCard }) })}>
          <CardInteractionOverlay />
          <ConfirmationDialog
            open
            title="Bỏ cuộc khỏi ván chơi?"
            message="Rời phòng lúc này đồng nghĩa với bỏ cuộc."
            confirmLabel="Bỏ cuộc"
            onCancel={onCancel}
            onConfirm={vi.fn()}
          />
        </stateContext.Provider>
      </PresentationProvider>,
    );
    const card = screen.getByRole('dialog', { name: 'Cổ tức' });
    const confirmation = screen.getByRole('alertdialog');
    // Same layer, so the later overlay in the document is the one on top.
    expect(card.parentElement?.compareDocumentPosition(confirmation.parentElement as Node))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(dismissCard).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Cổ tức' })).toBe(card);
    controller.dispose();
  });
});
