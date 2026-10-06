import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicTeam, SeatSwapRequest } from '@monopoly/shared';
import Lobby, { SEAT_SWAP_ENDED_NOTICE, type LobbyPlayerView } from './Lobby';
import { ToastProvider } from './Toast';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,lobby')) } }));

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
});

// Ada (host) and Chi are "Rồng" in red (seats 0 and 1), Grace and Dũng are "Phượng" in blue (seats 0 and 1).
const players: LobbyPlayerView[] = [
  { id: 'player-a', name: 'Ada', teamId: 'TEAM_1', teamSlot: 0, color: 'red', characterId: 'dog', ready: true, connected: true },
  { id: 'player-b', name: 'Grace', teamId: 'TEAM_2', teamSlot: 0, color: 'blue', characterId: 'panda', ready: true, connected: true },
  { id: 'player-c', name: 'Chi', teamId: 'TEAM_1', teamSlot: 1, color: 'red', characterId: 'cat', ready: true, connected: true },
  { id: 'player-d', name: 'Dũng', teamId: 'TEAM_2', teamSlot: 1, color: 'blue', characterId: 'duck', ready: true, connected: true },
];

const teams: PublicTeam[] = [
  { teamId: 'TEAM_1', name: 'Rồng', color: 'red', memberPlayerIds: ['player-a', 'player-c'] },
  { teamId: 'TEAM_2', name: 'Phượng', color: 'blue', memberPlayerIds: ['player-b', 'player-d'] },
];

type LobbyProps = ComponentProps<typeof Lobby>;

function makeHandlers() {
  return {
    onSetReady: vi.fn(),
    onSetAppearance: vi.fn(),
    onSetGameMode: vi.fn(),
    onSetTeamName: vi.fn(),
    onSetTeamColor: vi.fn(),
    onKickPlayer: vi.fn(),
    onMoveToSeat: vi.fn(),
    onRequestSeatSwap: vi.fn(),
    onCancelSeatSwap: vi.fn(),
    onRespondSeatSwap: vi.fn(),
    onStart: vi.fn(),
    onLeave: vi.fn(),
  };
}

function lobbyElement(handlers: ReturnType<typeof makeHandlers>, overrides: Partial<LobbyProps> = {}) {
  return (
    <ToastProvider>
      <Lobby
        roomCode="ROOM-1"
        players={players}
        playerId="player-a"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={4}
        gameMode="TEAM_2V2"
        teams={teams}
        seatSwapRequests={[]}
        busy={false}
        error={null}
        {...handlers}
        {...overrides}
      />
    </ToastProvider>
  );
}

function setup(overrides: Partial<LobbyProps> = {}) {
  const handlers = makeHandlers();
  const view = render(lobbyElement(handlers, overrides));
  const update = (next: Partial<LobbyProps>) => view.rerender(lobbyElement(handlers, { ...overrides, ...next }));
  return { ...view, handlers, update };
}

const zone = (name: string) => screen.getByRole('region', { name });
const seatsOf = (name: string) => within(screen.getByRole('list', { name: `Người chơi của đội ${name}` })).getAllByRole('listitem');
const swapRequest = (requesterPlayerId: string, targetPlayerId: string): SeatSwapRequest => ({ requesterPlayerId, targetPlayerId });

describe('Lobby mode control', () => {
  it('lets only the host switch between Solo and 2v2', () => {
    const { handlers } = setup({ gameMode: 'SOLO', teams: [] });

    const group = screen.getByRole('radiogroup', { name: 'Chế độ chơi' });
    expect(within(group).getByRole('radio', { name: 'Solo' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(group).getByRole('radio', { name: '2v2' }));
    expect(handlers.onSetGameMode).toHaveBeenCalledWith('TEAM_2V2');
  });

  it('shows a guest the mode as a label, without a control', () => {
    setup({ playerId: 'player-b' });

    expect(screen.queryByRole('radiogroup', { name: 'Chế độ chơi' })).toBeNull();
    expect(document.querySelector('.lobby__mode')?.textContent).toContain('2v2');
  });

  it('keeps the Solo lobby free of any team zone and of any swap control', () => {
    setup({ gameMode: 'SOLO', teams: [] });

    expect(document.querySelectorAll('.lobby-team')).toHaveLength(0);
    expect(screen.getByRole('list', { name: 'Danh sách người chơi' })).toBeTruthy();
    // Positions mean nothing in Solo: no swap, no move, only the host's kick keys.
    expect(screen.queryByRole('button', { name: /Đổi chỗ|Chuyển sang/u })).toBeNull();
  });
});

describe('Lobby team zones', () => {
  it('shows two named teams with their members and marks the viewer\'s own team', () => {
    setup({ playerId: 'player-c' });

    const rong = zone('Rồng');
    const phuong = zone('Phượng');
    expect(within(rong).getByRole('list', { name: 'Người chơi của đội Rồng' }).textContent).toContain('Ada');
    expect(within(rong).getByRole('list', { name: 'Người chơi của đội Rồng' }).textContent).toContain('Chi (bạn)');
    expect(within(phuong).getByRole('list', { name: 'Người chơi của đội Phượng' }).textContent).toContain('Grace');
    expect(within(rong).getByText('Đội của bạn')).toBeTruthy();
    expect(within(phuong).queryByText('Đội của bạn')).toBeNull();
    expect(within(rong).getByLabelText('2 trên 2 người')).toBeTruthy();
  });

  it('replaces the colour picker with a note: the mascot wears the team colour', () => {
    setup();

    expect(screen.queryByRole('group', { name: 'Chọn màu người chơi' })).toBeNull();
    expect(screen.getByRole('note').textContent).toContain('Mascot luôn mang màu đội Rồng');
  });

  it('locks the mascot a teammate already wears but not one the other team wears', () => {
    const { handlers } = setup();

    const locked = screen.getByRole('button', { name: /\(đồng đội đã chọn\)/u });
    expect(locked.hasAttribute('disabled')).toBe(true);
    // Grace (Phượng) wears the panda; that is still free for Ada, whose teammate Chi wears the cat.
    const panda = screen.getAllByRole('button').find(button => /^Gấu trúc$/u.test(button.getAttribute('aria-label') ?? ''));
    expect(panda?.hasAttribute('disabled')).toBe(false);
    fireEvent.click(panda!);
    expect(handlers.onSetAppearance).toHaveBeenCalledWith({ characterId: 'panda' });
  });
});

describe('Lobby seat cells', () => {
  it('draws exactly two cells per team, in seat order', () => {
    setup();

    for (const name of ['Rồng', 'Phượng']) expect(seatsOf(name)).toHaveLength(2);
    expect(seatsOf('Rồng').map(seat => seat.getAttribute('data-player-id'))).toEqual(['player-a', 'player-c']);
    expect(seatsOf('Phượng').map(seat => seat.getAttribute('data-player-id'))).toEqual(['player-b', 'player-d']);
  });

  it('seats a member in the cell of their own seat number, so a lone member in seat 1 follows an empty first cell', () => {
    // Grace moved to the second seat of Phượng and Dũng is not there: the first cell of Phượng is the empty one.
    setup({
      players: [players[0], { ...players[1], teamSlot: 1 }, players[2]],
    });

    const [first, second] = seatsOf('Phượng');
    expect(first.classList.contains('lobby-player--empty')).toBe(true);
    expect(within(first).getByText('Chỗ trống 1')).toBeTruthy();
    expect(second.getAttribute('data-player-id')).toBe('player-b');
    expect(within(zone('Phượng')).getByLabelText('1 trên 2 người')).toBeTruthy();
  });

  it('keeps an empty seat in its own position inside a team that has a member in the first seat', () => {
    setup({ players: players.slice(0, 3) });

    const [first, second] = seatsOf('Phượng');
    expect(first.getAttribute('data-player-id')).toBe('player-b');
    expect(second.classList.contains('lobby-player--empty')).toBe(true);
    expect(within(second).getByText('Chỗ trống 2')).toBeTruthy();
  });

  it('never hides a member whose seat is taken: they take the first free cell', () => {
    setup({ players: [players[0], { ...players[2], teamSlot: 0 }, players[1], players[3]] });

    expect(seatsOf('Rồng').map(seat => seat.getAttribute('data-player-id'))).toEqual(['player-a', 'player-c']);
  });
});

describe('Lobby seat swap controls', () => {
  it('puts a swap button on every seat but the viewer\'s own', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Đổi chỗ với Ada' })).toBeNull();
    for (const name of ['Grace', 'Chi', 'Dũng']) {
      expect(screen.getByRole('button', { name: `Đổi chỗ với ${name}` })).toBeTruthy();
    }
    // The own seat keeps its ready key and nothing to swap with.
    expect(within(seatsOf('Rồng')[0]).queryByRole('button', { name: /Đổi chỗ|Chuyển sang/u })).toBeNull();
  });

  it('puts a move button on an empty seat, named after its number and team', () => {
    setup({ players: players.slice(0, 3) });

    expect(screen.getByRole('button', { name: 'Chuyển sang chỗ trống 2 của đội Phượng' })).toBeTruthy();
  });

  it('moves to an empty seat at once, with the team and the seat number', () => {
    const { handlers } = setup({ players: players.slice(0, 3) });

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang chỗ trống 2 của đội Phượng' }));

    expect(handlers.onMoveToSeat).toHaveBeenCalledWith('TEAM_2', 1);
    expect(handlers.onRequestSeatSwap).not.toHaveBeenCalled();
  });

  it('lets the viewer take the other seat of their own team too', () => {
    const { handlers } = setup({ players: [players[0], players[1], players[3]] });

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang chỗ trống 2 của đội Rồng' }));

    expect(handlers.onMoveToSeat).toHaveBeenCalledWith('TEAM_1', 1);
  });

  it('asks the player of an occupied seat to swap and moves nothing itself', () => {
    const { handlers } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Đổi chỗ với Grace' }));

    expect(handlers.onRequestSeatSwap).toHaveBeenCalledWith('player-b');
    expect(handlers.onMoveToSeat).not.toHaveBeenCalled();
  });

  it('gives the host no special right: a guest sees the same swap buttons and the host asks like a guest', () => {
    const guest = setup({ playerId: 'player-b' });
    expect(screen.queryByRole('button', { name: /Đổi đội của/u })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Đổi chỗ với / })).toHaveLength(3);
    guest.unmount();

    const { handlers } = setup();
    // Same three buttons, each one a request addressed to one player: nothing moves two other players.
    expect(screen.getAllByRole('button', { name: /^Đổi chỗ với / })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Đổi chỗ với Dũng' }));
    expect(handlers.onRequestSeatSwap).toHaveBeenCalledWith('player-d');
    expect(handlers.onRequestSeatSwap).toHaveBeenCalledTimes(1);
  });

  it('takes every swap control away from a viewer without a seat', () => {
    setup({ playerId: 'nobody' });

    expect(screen.queryByRole('button', { name: /Đổi chỗ|Chuyển sang/u })).toBeNull();
  });

  it('disables every swap and move button while a request is in flight', () => {
    setup({ players: players.slice(0, 3), busy: true });

    for (const button of screen.getAllByRole<HTMLButtonElement>('button', { name: /^(Đổi chỗ với|Chuyển sang)/u })) {
      expect(button.disabled).toBe(true);
    }
  });
});

describe('Lobby pending seat swap (the viewer asked)', () => {
  it('says who is awaited on that seat and offers to take the request back', () => {
    const { handlers } = setup({ seatSwapRequests: [swapRequest('player-a', 'player-b')] });

    const graceSeat = seatsOf('Phượng')[0];
    expect(within(graceSeat).getByRole('status').textContent).toBe('Đang chờ Grace trả lời');
    expect(within(graceSeat).queryByRole('button', { name: 'Đổi chỗ với Grace' })).toBeNull();
    // Every other seat can still be asked: a new request replaces the open one.
    expect(screen.getByRole('button', { name: 'Đổi chỗ với Dũng' })).toBeTruthy();

    fireEvent.click(within(graceSeat).getByRole('button', { name: 'Hủy yêu cầu đổi chỗ với Grace' }));
    expect(handlers.onCancelSeatSwap).toHaveBeenCalledTimes(1);
  });

  it('shows the waiting state to the requester only: a request of someone else leaves the seats alone', () => {
    setup({ playerId: 'player-c', seatSwapRequests: [swapRequest('player-a', 'player-b')] });

    expect(screen.queryByText(/Đang chờ/u)).toBeNull();
    expect(screen.getByRole('button', { name: 'Đổi chỗ với Grace' })).toBeTruthy();
  });

  it('disables the cancel while a request is in flight', () => {
    setup({ seatSwapRequests: [swapRequest('player-a', 'player-b')], busy: true });

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Hủy yêu cầu đổi chỗ với Grace' }).disabled).toBe(true);
  });

  it('says the request ended when it disappears and the viewer\'s seat did not change', async () => {
    const { update } = setup({ seatSwapRequests: [swapRequest('player-a', 'player-b')] });
    expect(screen.queryByText(SEAT_SWAP_ENDED_NOTICE)).toBeNull();

    // Grace declined (or moved away): the room no longer holds the request and Ada still sits where she was.
    update({ seatSwapRequests: [] });

    expect(await screen.findByText(SEAT_SWAP_ENDED_NOTICE)).toBeTruthy();
    expect(SEAT_SWAP_ENDED_NOTICE).toBe('Yêu cầu đổi chỗ đã kết thúc.');
  });

  it('says nothing when the request ended because the swap happened (the viewer\'s seat changed)', () => {
    const { update } = setup({ seatSwapRequests: [swapRequest('player-a', 'player-b')] });

    update({
      seatSwapRequests: [],
      players: [
        { ...players[0], teamId: 'TEAM_2', teamSlot: 0, color: 'blue' },
        { ...players[1], teamId: 'TEAM_1', teamSlot: 0, color: 'red' },
        players[2],
        players[3],
      ],
    });

    expect(screen.queryByText(SEAT_SWAP_ENDED_NOTICE)).toBeNull();
  });

  it('says nothing when the viewer takes the request back themselves', () => {
    const { update } = setup({ seatSwapRequests: [swapRequest('player-a', 'player-b')] });

    fireEvent.click(screen.getByRole('button', { name: 'Hủy yêu cầu đổi chỗ với Grace' }));
    update({ seatSwapRequests: [] });

    expect(screen.queryByText(SEAT_SWAP_ENDED_NOTICE)).toBeNull();
  });

  it('says nothing when the request is replaced by a new one to someone else', () => {
    const { update } = setup({ seatSwapRequests: [swapRequest('player-a', 'player-b')] });

    update({ seatSwapRequests: [swapRequest('player-a', 'player-d')] });

    expect(screen.queryByText(SEAT_SWAP_ENDED_NOTICE)).toBeNull();
    expect(within(seatsOf('Phượng')[1]).getByRole('status').textContent).toBe('Đang chờ Dũng trả lời');
  });
});

describe('Lobby seat swap request for the viewer (the target)', () => {
  const request = [swapRequest('player-a', 'player-b')];

  it('asks the target in a central dialog and moves nothing until they answer', () => {
    const { handlers } = setup({ playerId: 'player-b', seatSwapRequests: request });

    const dialog = screen.getByRole('alertdialog', { name: 'Ada muốn đổi chỗ với bạn' });
    expect(within(dialog).getByRole('button', { name: 'Đồng ý' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Từ chối' })).toBeTruthy();
    expect(handlers.onRespondSeatSwap).not.toHaveBeenCalled();
  });

  it('tells the target where each of them goes when the teams differ', () => {
    setup({ playerId: 'player-b', seatSwapRequests: request });

    const description = screen.getByRole('alertdialog').getAttribute('aria-describedby');
    const message = document.getElementById(description ?? '')?.textContent ?? '';
    expect(message).toContain('Bạn sang đội Rồng, Ada sang đội Phượng');
    expect(message).toContain('phải bấm lại Sẵn sàng');
  });

  it('says it is a plain exchange of seats inside the team when the teams are the same', () => {
    setup({ playerId: 'player-c', seatSwapRequests: [swapRequest('player-a', 'player-c')] });

    const description = screen.getByRole('alertdialog').getAttribute('aria-describedby');
    expect(document.getElementById(description ?? '')?.textContent).toBe('Hai bạn đổi chỗ cho nhau trong đội Rồng.');
  });

  it('accepts with "Đồng ý", naming the requester', () => {
    const { handlers } = setup({ playerId: 'player-b', seatSwapRequests: request });

    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý' }));

    expect(handlers.onRespondSeatSwap).toHaveBeenCalledWith('player-a', true);
  });

  it('declines with "Từ chối", and with Escape', () => {
    const { handlers } = setup({ playerId: 'player-b', seatSwapRequests: request });

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(handlers.onRespondSeatSwap).toHaveBeenLastCalledWith('player-a', false);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handlers.onRespondSeatSwap).toHaveBeenCalledTimes(2);
    expect(handlers.onRespondSeatSwap).toHaveBeenLastCalledWith('player-a', false);
  });

  it('closes by itself when the room no longer holds the request', async () => {
    const { update } = setup({ playerId: 'player-b', seatSwapRequests: request });
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    update({ seatSwapRequests: [] });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('asks the oldest request first when several arrive', () => {
    const { update } = setup({
      playerId: 'player-b',
      seatSwapRequests: [swapRequest('player-d', 'player-b'), swapRequest('player-a', 'player-b')],
    });
    expect(screen.getByRole('alertdialog', { name: 'Dũng muốn đổi chỗ với bạn' })).toBeTruthy();

    update({ seatSwapRequests: [swapRequest('player-a', 'player-b')] });
    return waitFor(() => expect(screen.getByRole('alertdialog', { name: 'Ada muốn đổi chỗ với bạn' })).toBeTruthy());
  });

  it('shows the question to its target only, never to the requester or to someone else', () => {
    for (const viewer of ['player-a', 'player-c', 'player-d']) {
      const view = setup({ playerId: viewer, seatSwapRequests: request });
      expect(screen.queryByRole('alertdialog')).toBeNull();
      view.unmount();
    }
  });

  it('does not ask about a requester who is no longer in the lobby', () => {
    setup({ playerId: 'player-b', players: players.filter(player => player.id !== 'player-a'), seatSwapRequests: request });

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('disables both answers while another request is in flight', () => {
    setup({ playerId: 'player-b', seatSwapRequests: request, busy: true });

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đồng ý' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Từ chối' }).disabled).toBe(true);
  });
});

describe('Lobby kick', () => {
  it('puts an X on every other seat for the host, named after the player, and none on their own', () => {
    setup();

    for (const name of ['Grace', 'Chi', 'Dũng']) {
      expect(screen.getByRole('button', { name: `Mời ${name} ra khỏi phòng` })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Mời Ada ra khỏi phòng' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Mời .* ra khỏi phòng$/u })).toHaveLength(3);
  });

  it('hides the X from everyone who is not the host', () => {
    setup({ playerId: 'player-b' });

    expect(screen.queryByRole('button', { name: /ra khỏi phòng/u })).toBeNull();
  });

  it('asks for a confirmation first and sends nothing until it is given', () => {
    const { handlers } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Mời Grace ra khỏi phòng' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Mời Grace ra khỏi phòng?' });
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeTruthy();
    expect(handlers.onKickPlayer).not.toHaveBeenCalled();
  });

  it('kicks the chosen player once confirmed', () => {
    const { handlers } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Mời Dũng ra khỏi phòng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mời ra' }));

    expect(handlers.onKickPlayer).toHaveBeenCalledTimes(1);
    expect(handlers.onKickPlayer).toHaveBeenCalledWith('player-d');
  });

  it('keeps everyone when the host cancels, with the button or with Escape', async () => {
    const { handlers } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Mời Grace ra khỏi phòng' }));
    const first = screen.getByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // The dialog animates out; the next question opens only after it has left the page.
    await waitFor(() => expect(first.isConnected).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Mời Grace ra khỏi phòng' }));
    const second = screen.getByRole('alertdialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(second.isConnected).toBe(false));
    expect(handlers.onKickPlayer).not.toHaveBeenCalled();
  });

  it('drops the question by itself when that player has already left', async () => {
    const { update } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Mời Grace ra khỏi phòng' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    update({ players: players.filter(player => player.id !== 'player-b') });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('disables the X while a request is in flight', () => {
    setup({ busy: true });

    for (const button of screen.getAllByRole<HTMLButtonElement>('button', { name: /^Mời .* ra khỏi phòng$/u })) {
      expect(button.disabled).toBe(true);
    }
  });

  it('is never window.confirm', () => {
    const confirm = vi.spyOn(window, 'confirm');
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Mời Grace ra khỏi phòng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mời ra' }));

    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe('Lobby team name and colour', () => {
  it('lets a member rename their own team on Enter without touching anyone\'s Ready', () => {
    const { handlers } = setup({ playerId: 'player-c' });

    const field = within(zone('Rồng')).getByLabelText('Tên đội');
    fireEvent.change(field, { target: { value: 'Hổ Vàng' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    // Only the name travels: the server renames the sender's own team.
    expect(handlers.onSetTeamName).toHaveBeenCalledWith('Hổ Vàng');
    expect(handlers.onSetReady).not.toHaveBeenCalled();
  });

  it('gives only the viewer\'s own team a name editor, host included', () => {
    // Ada is the host and sits in Rồng: she edits Rồng and cannot touch Phượng's name.
    setup();

    expect(screen.getAllByLabelText('Tên đội')).toHaveLength(1);
    expect(within(zone('Rồng')).getByLabelText('Tên đội')).toBeTruthy();
    expect(within(zone('Phượng')).queryByLabelText('Tên đội')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Phượng' })).toBeTruthy();
  });

  it('lets a guest rename their own team and shows the host\'s team name read-only', () => {
    const { handlers } = setup({ playerId: 'player-b' });

    expect(within(zone('Rồng')).queryByLabelText('Tên đội')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Rồng' })).toBeTruthy();
    const field = within(zone('Phượng')).getByLabelText('Tên đội');
    fireEvent.change(field, { target: { value: 'Hổ Vàng' } });
    fireEvent.blur(field);
    expect(handlers.onSetTeamName).toHaveBeenCalledWith('Hổ Vàng');
  });

  it('puts the old name back on Escape and never sends an empty name', () => {
    const { handlers } = setup();

    const first = screen.getByLabelText<HTMLInputElement>('Tên đội');
    fireEvent.focus(first);
    fireEvent.change(first, { target: { value: 'Hổ Vàng' } });
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(first.value).toBe('Rồng');

    fireEvent.change(first, { target: { value: '   ' } });
    fireEvent.blur(first);
    expect(first.value).toBe('Rồng');
    expect(handlers.onSetTeamName).not.toHaveBeenCalled();
  });

  it('limits a team name to 20 characters', () => {
    setup();
    expect(screen.getByLabelText<HTMLInputElement>('Tên đội').maxLength).toBe(20);
  });

  it('disables the name editor while a request is in flight', () => {
    setup({ busy: true });
    expect(screen.getByLabelText<HTMLInputElement>('Tên đội').disabled).toBe(true);
  });

  it('lets a member recolour their own team and disables the colour the other team wears', () => {
    const { handlers } = setup({ playerId: 'player-c' });

    const picker = screen.getByRole('group', { name: 'Màu của đội Rồng' });
    expect(within(picker).getByRole('button', { name: 'Đỏ' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(picker).getByRole('button', { name: /Xanh dương \(đội kia đang dùng\)/u }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(picker).getByRole('button', { name: 'Xanh lá' }));
    expect(handlers.onSetTeamColor).toHaveBeenCalledWith('green');
  });

  it('shows the other team\'s colour as text only, so a player cannot recolour the opponents', () => {
    setup({ playerId: 'player-c' });

    expect(screen.queryByRole('group', { name: 'Màu của đội Phượng' })).toBeNull();
    expect(within(zone('Phượng')).getByText(/Màu đội:/u)).toBeTruthy();
  });
});

describe('Lobby start in 2v2', () => {
  it('lets the host start four ready players, two on each team', () => {
    const { handlers } = setup();

    const start = screen.getByRole('button', { name: 'Bắt đầu' });
    expect(start.hasAttribute('disabled')).toBe(false);
    fireEvent.click(start);
    expect(handlers.onStart).toHaveBeenCalledTimes(1);
  });

  it('refuses a lobby that is not exactly four and says why', () => {
    setup({ players: players.slice(0, 3) });

    expect(screen.getByRole('button', { name: 'Bắt đầu' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Chế độ 2v2 cần đúng 4 người chơi')).toBeTruthy();
  });

  it('refuses a 3v1 split while it is being configured', () => {
    const threeToOne = players.map(player => (
      player.id === 'player-d' ? { ...player, teamId: 'TEAM_1' as const, color: 'red' as const } : player
    ));
    setup({ players: threeToOne });

    expect(screen.getByRole('button', { name: 'Bắt đầu' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Mỗi đội cần đúng 2 người chơi')).toBeTruthy();
  });

  it('shows a guest no start button', () => {
    setup({ playerId: 'player-b' });
    expect(screen.queryByRole('button', { name: 'Bắt đầu' })).toBeNull();
  });
});
