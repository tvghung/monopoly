import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REVIVE_WINDOW_SURVIVOR_TURNS } from '@monopoly/shared';
import stateContext from '../../../internal';
import type { SocketFunctions } from '../../../types';
import { makeRoom, makeTeamRoom } from '../../presentation/testFixtures';
import PlayerPortfolioModal from './PlayerPortfolioModal';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.visualTheme;
});

const socketFunctions = {
  rollDice: vi.fn(), buyProperty: vi.fn(), sendChat: vi.fn(), makeOffer: vi.fn(),
  acceptOffer: vi.fn(), declineOffer: vi.fn(), sellHouse: vi.fn(), payBail: vi.fn(),
  useJailCard: vi.fn(),
} satisfies SocketFunctions;

type Room = ReturnType<typeof makeRoom>;

function buildRoom(mutate: (room: Room) => void = () => undefined): Room {
  const room = makeRoom();
  room.gameState.boardState.ownedProps = {
    1: { id: 'player-a', color: 'red', houses: 0 },
    12: { id: 'player-b', color: 'blue', houses: 0 },
    37: { id: 'player-b', color: 'blue', houses: 3 },
    39: { id: 'player-b', color: 'blue', houses: 5 },
  };
  mutate(room);
  return room;
}

function renderPortfolio(
  room: Room,
  props: { playerId: string | null; onSelectTile?: (tileId: number) => void },
  onClose = vi.fn(),
) {
  const element = (playerId: string | null) => (
    <stateContext.Provider value={{
      state: room.gameState,
      socketFunctions,
      // The viewer is An; the portfolio is always read-only whoever it belongs to.
      playerId: 'player-a',
      role: 'PLAYER',
      connected: true,
      canMutate: true,
      privatePlayerState: null,
      privateOffers: [],
      roomPlayers: room.players,
    }}>
      <PlayerPortfolioModal playerId={playerId} onClose={onClose} onSelectTile={props.onSelectTile} />
    </stateContext.Provider>
  );
  const view = render(element(props.playerId));
  return { onClose, view, element };
}

describe('PlayerPortfolioModal', () => {
  it('shows another player\'s balance, counts and deeds, named after them', () => {
    renderPortfolio(buildRoom(), { playerId: 'player-b' });

    const dialog = screen.getByRole('dialog', { name: 'Tài sản của Bình' });
    expect(within(dialog).getByText('Số dư hiện tại')).toBeTruthy();
    expect(within(dialog).getByText('1.500.000 ₫')).toBeTruthy();
    expect(within(dialog).getByText('3 tài sản')).toBeTruthy();
    expect(within(dialog).getByText('3 nhà')).toBeTruthy();
    expect(within(dialog).getByText('1 khách sạn')).toBeTruthy();
    const blue = within(dialog).getByRole('group', { name: 'Xanh dương' });
    expect(within(blue).getAllByRole('article')).toHaveLength(2);
    expect(within(blue).getByText('Đủ nhóm')).toBeTruthy();
    expect(within(dialog).getByRole('img', { name: /^Linh vật / })).toBeTruthy();
    // The viewer's own tile is not in this portfolio.
    expect(within(dialog).queryByRole('article', { name: 'Cà Mau' })).toBeNull();
  });

  it('is read-only: no trade, sell or build action on any deed', () => {
    renderPortfolio(buildRoom(), { playerId: 'player-b', onSelectTile: vi.fn() });

    const dialog = screen.getByRole('dialog', { name: 'Tài sản của Bình' });
    const names = within(dialog).getAllByRole('button').map(button => button.getAttribute('aria-label') ?? button.textContent);
    expect(names.filter(name => !/^(Đóng|Xem )/u.test(name ?? ''))).toEqual([]);
  });

  it('hands a property to the inspection dialog after closing itself', () => {
    const onSelectTile = vi.fn();
    const { onClose } = renderPortfolio(buildRoom(), { playerId: 'player-b', onSelectTile });

    fireEvent.click(screen.getByRole('button', { name: 'Xem Đồng Khởi' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectTile).toHaveBeenCalledWith(37);
  });

  it('shows the deeds without an inspect button when nothing can open them', () => {
    renderPortfolio(buildRoom(), { playerId: 'player-b' });

    expect(screen.getByRole('article', { name: 'Đồng Khởi' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Xem / })).toBeNull();
  });

  it('follows the authoritative balance while open', () => {
    const room = buildRoom();
    const { view, element } = renderPortfolio(room, { playerId: 'player-b' });
    expect(screen.getByText('1.500.000 ₫')).toBeTruthy();

    room.gameState = { ...room.gameState, players: { ...room.gameState.players, 'player-b': { ...room.gameState.players['player-b'], accountBalance: 420 } } };
    view.rerender(element('player-b'));
    expect(screen.getByText('420.000 ₫')).toBeTruthy();
  });

  it('shows a sensible empty state for a player who owns nothing', () => {
    renderPortfolio(buildRoom(room => { room.gameState.boardState.ownedProps = {}; }), { playerId: 'player-b' });

    expect(screen.getByText('Bình chưa sở hữu tài sản nào.')).toBeTruthy();
    expect(screen.getByText('0 tài sản')).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('works for a player who went bankrupt: their name, a Phá sản chip and no deeds', () => {
    renderPortfolio(buildRoom(room => {
      room.gameState.boardState.finishedPlayers['player-b'] = {
        teamId: 'TEAM_2',
        name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT', accountBalance: 0,
      };
      delete room.gameState.players['player-b'];
      room.gameState.boardState.ownedProps = { 1: { id: 'player-a', color: 'red', houses: 0 } };
    }), { playerId: 'player-b' });

    const dialog = screen.getByRole('dialog', { name: 'Tài sản của Bình' });
    expect(within(dialog).getByText('Phá sản')).toBeTruthy();
    expect(within(dialog).queryByText('Số dư hiện tại')).toBeNull();
    expect(within(dialog).getByText('Bình không còn tài sản nào.')).toBeTruthy();
    expect(within(dialog).queryByRole('article')).toBeNull();
  });

  it('works for a player who left the game: Đã rời instead of a balance', () => {
    renderPortfolio(buildRoom(room => {
      room.gameState.boardState.finishedPlayers['player-b'] = {
        teamId: 'TEAM_2',
        name: 'Bình', color: 'blue', characterId: 'panda', reason: 'LEFT', accountBalance: 700,
      };
      delete room.gameState.players['player-b'];
      room.gameState.boardState.ownedProps = {};
    }), { playerId: 'player-b' });

    const dialog = screen.getByRole('dialog', { name: 'Tài sản của Bình' });
    expect(within(dialog).getByText('Đã rời')).toBeTruthy();
    expect(within(dialog).queryByText('700.000 ₫')).toBeNull();
    expect(within(dialog).getByText('Bình không còn tài sản nào.')).toBeTruthy();
  });

  it('shows the viewer\'s own portfolio the same way', () => {
    renderPortfolio(buildRoom(), { playerId: 'player-a' });

    const dialog = screen.getByRole('dialog', { name: 'Tài sản của An' });
    expect(within(dialog).getByText('1 tài sản')).toBeTruthy();
    expect(within(dialog).getByRole('article', { name: 'Cà Mau' })).toBeTruthy();
  });

  it('closes with Đóng, Escape and a click outside', () => {
    const { onClose } = renderPortfolio(buildRoom(), { playerId: 'player-b' });
    const dialog = screen.getByRole('dialog', { name: 'Tài sản của Bình' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('renders nothing without a player, and keeps the last player while animating out', async () => {
    const room = buildRoom();
    const { view, element } = renderPortfolio(room, { playerId: null });
    expect(document.querySelector('.ds-modal__card')).toBeNull();

    view.rerender(element('player-b'));
    expect(screen.getByRole('dialog', { name: 'Tài sản của Bình' })).toBeTruthy();

    view.rerender(element(null));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.ds-modal__card')?.textContent).toContain('Tài sản của Bình');
    await waitFor(() => expect(document.querySelector('.ds-modal__card')).toBeNull());
  });

  it('renders nothing for a player the room does not know', () => {
    renderPortfolio(buildRoom(), { playerId: 'player-x' });
    expect(document.querySelector('.ds-modal__card')).toBeNull();
  });
});

describe('PlayerPortfolioModal in a 2v2 game', () => {
  function teamRoom(mutate: (room: ReturnType<typeof makeTeamRoom>) => void = () => undefined) {
    const room = makeTeamRoom();
    room.gameState.boardState.ownedProps = { 1: { id: 'player-c', color: 'red', houses: 0 } };
    mutate(room);
    return room;
  }
  const open = (room: ReturnType<typeof makeTeamRoom>, playerId: string) => render(
    <stateContext.Provider value={{
      state: room.gameState,
      socketFunctions,
      playerId: 'player-a',
      role: 'PLAYER',
      connected: true,
      canMutate: true,
      privatePlayerState: null,
      privateOffers: [],
      roomPlayers: room.players,
    }}>
      <PlayerPortfolioModal playerId={playerId} onClose={vi.fn()} />
    </stateContext.Provider>,
  );

  it('tags a teammate and an opponent with their team and relation', () => {
    const { unmount } = open(teamRoom(), 'player-c');
    expect(within(screen.getByRole('dialog', { name: 'Tài sản của Chi' })).getByText('Đội Team 1 · Đồng đội')).toBeTruthy();
    unmount();
    open(teamRoom(), 'player-b');
    expect(within(screen.getByRole('dialog', { name: 'Tài sản của Bình' })).getByText('Đội Team 2 · Đối thủ')).toBeTruthy();
  });

  it('shows a bankrupt teammate as revivable with the turns left, then as permanently out', () => {
    const eliminate = (room: ReturnType<typeof makeTeamRoom>) => {
      delete room.gameState.players['player-c'];
      room.gameState.boardState.players = ['player-a', 'player-b', 'player-d'];
      room.gameState.boardState.finishedPlayers['player-c'] = {
        teamId: 'TEAM_1', name: 'Chi', color: 'red', characterId: 'cat', reason: 'BANKRUPT', accountBalance: 0,
      };
      room.gameState.boardState.ownedProps = {};
    };
    const revivable = open(teamRoom(room => {
      eliminate(room);
      room.gameState.boardState.teamPlay.reviveWindows = [{
        playerId: 'player-c', teamId: 'TEAM_1', survivorPlayerId: 'player-a', turnsRemaining: REVIVE_WINDOW_SURVIVOR_TURNS, openedAtTurnNumber: 1,
      }];
    }), 'player-c');
    const dialog = screen.getByRole('dialog', { name: 'Tài sản của Chi' });
    expect(within(dialog).getByText('Phá sản')).toBeTruthy();
    expect(within(dialog).getByText(`Có thể hồi sinh · Còn ${REVIVE_WINDOW_SURVIVOR_TURNS} lượt`)).toBeTruthy();
    revivable.unmount();

    open(teamRoom(eliminate), 'player-c');
    expect(within(screen.getByRole('dialog', { name: 'Tài sản của Chi' })).getByText('Đã bị loại vĩnh viễn')).toBeTruthy();
  });

  it('shows no team tag in a Solo game', () => {
    renderPortfolio(buildRoom(), { playerId: 'player-b' });
    expect(document.querySelector('.team-chip')).toBeNull();
  });
});
