import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { CHARACTER_IDS } from '@monopoly/shared';
import { CHARACTER_REGISTRY } from '../game/characters/characterRegistry';
import type { HostRuntimeStatus, OwnTheBlockDesktopBridge } from '../runtime/types';
import Lobby from './Lobby';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,lobby')) } }));

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

const readyPlayers = [
  { id: 'player-a', name: 'Ada', color: 'red' as const, characterId: 'dog' as const, teamId: 'TEAM_1' as const, teamSlot: 0 as const, ready: true, connected: true, kind: 'HUMAN' as const },
  { id: 'player-b', name: 'Grace', color: 'blue' as const, characterId: 'panda' as const, teamId: 'TEAM_2' as const, teamSlot: 0 as const, ready: true, connected: true, kind: 'HUMAN' as const },
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
    expect(document.querySelector('.lobby__header-actions')?.contains(startButton)).toBe(true);
    fireEvent.click(startButton);
    expect(onStart).toHaveBeenCalledOnce();
    expect(screen.getByText('Ada (bạn)')).toBeTruthy();
    expect(screen.getByText('Chủ phòng')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText('OWN THE BLOCK')).toBeNull();
    expect(document.querySelectorAll('.lobby-player__character')).toHaveLength(0);
    expect(document.querySelectorAll('.lobby-player .ds-badge')).toHaveLength(1);
    const readyDots = screen.getAllByLabelText('Đã sẵn sàng');
    expect(readyDots).toHaveLength(2);
    expect(readyDots.every(dot => dot.className.includes('lobby-player__ready-dot--ready'))).toBe(true);
    expect(screen.queryByLabelText('Mất kết nối')).toBeNull();
  });

  it('keeps start disabled while a player is offline or not ready', () => {
    render(
      <Lobby
        roomCode="ROOM-2"
        players={[readyPlayers[0], { ...readyPlayers[1], connected: false, kind: 'HUMAN' as const, ready: false }]}
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
    expect(screen.getByLabelText('Mất kết nối')).toBeTruthy();
    expect(screen.getByLabelText('Chưa sẵn sàng').className).toContain('lobby-player__ready-dot--not-ready');
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
    expect(screen.queryByText(/Đang chờ Chủ Phòng/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Hủy sẵn sàng' })).toBeTruthy();
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

    expect(screen.getByLabelText('Chọn nhân vật của bạn')).toBeTruthy();
    expect(screen.queryByText('Dog')).toBeNull();
    expect(screen.queryByText('Panda')).toBeNull();
    expect(screen.queryByText('Chó')).toBeNull();
    expect(screen.queryByText('Gấu trúc')).toBeNull();
    const characterGroup = screen.getByRole('group', { name: 'Chọn mascot' });
    const colorGroup = screen.getByRole('group', { name: 'Chọn màu người chơi' });
    expect(characterGroup.querySelectorAll('button')).toHaveLength(8);
    expect(colorGroup.querySelectorAll('button')).toHaveLength(10);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Gấu trúc' }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Xanh dương' }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đỏ' }).disabled).toBe(false);
    expect(screen.queryByText('Xem trước trong phòng')).toBeNull();
    expect(document.querySelector<HTMLImageElement>('.lobby-player__mascot')?.src)
      .toContain('%23f2384a');
  });

  it('keeps ready control on the current player card and exposes the no-mascot guidance', () => {
    const onSetReady = vi.fn();
    const { rerender } = render(
      <Lobby
        roomCode="ROOM-READY"
        players={[
          { ...readyPlayers[0], ready: false, characterId: null },
          readyPlayers[1],
        ]}
        playerId="player-a"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={4}
        busy={false}
        error={null}
        onSetReady={onSetReady}
        onSetAppearance={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    const readyButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Sẵn sàng' });
    expect(readyButton.disabled).toBe(true);
    expect(readyButton.title).toBe('Chọn mascot trước để sẵn sàng');
    expect(screen.queryByRole('button', { name: 'Hủy sẵn sàng' })).toBeNull();

    rerender(
      <Lobby
        roomCode="ROOM-READY"
        players={[
          { ...readyPlayers[0], ready: false, characterId: 'dog' },
          readyPlayers[1],
        ]}
        playerId="player-a"
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={4}
        busy={false}
        error={null}
        onSetReady={onSetReady}
        onSetAppearance={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sẵn sàng' }));
    expect(onSetReady).toHaveBeenCalledWith(true);
    expect(screen.getAllByRole('button', { name: 'Sẵn sàng' })).toHaveLength(1);
  });

  it('keeps readiness and connectivity as independent roster states', () => {
    render(
      <Lobby
        roomCode="ROOM-STATUS"
        players={[
          readyPlayers[0],
          { ...readyPlayers[1], ready: false },
          { teamId: 'TEAM_2', teamSlot: 1, id: 'player-c', name: 'Lin', color: 'green', characterId: 'cat', ready: true, connected: false, kind: 'HUMAN' as const },
          { teamId: 'TEAM_1', teamSlot: 1, id: 'player-d', name: 'Sam', color: 'yellow', characterId: 'duck', ready: false, connected: false, kind: 'HUMAN' as const },
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

    expect(screen.getAllByLabelText('Đã sẵn sàng')).toHaveLength(2);
    expect(screen.getAllByLabelText('Chưa sẵn sàng')).toHaveLength(2);
    expect(screen.getAllByLabelText('Mất kết nối')).toHaveLength(2);
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

    const stage = screen.getByRole('group', { name: /Mascot đang xem: Chó/u });
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    expect(onSetAppearance).toHaveBeenCalledWith({ characterId: 'capybara' });
    expect(screen.getByRole('button', { name: 'Chó' }).getAttribute('aria-pressed')).toBe('true');

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
          { teamId: 'TEAM_2', teamSlot: 0, id: 'player-a', name: 'Ada', color: 'blue', characterId: 'panda', ready: true, connected: true, kind: 'HUMAN' as const },
          { teamId: 'TEAM_2', teamSlot: 1, id: 'player-b', name: 'Grace', color: 'blue', characterId: 'dog', ready: true, connected: true, kind: 'HUMAN' as const },
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

    fireEvent.click(screen.getByRole('button', { name: 'Chó' }));
    expect(onSetAppearance).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: /Mascot đang xem: Chó/u })).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Xanh dương \(đã dùng với Chó\)/u })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: 'Đỏ' }));
    expect(onSetAppearance).toHaveBeenCalledWith({ characterId: 'dog', color: 'red' });
  });
});

function makeProps(): ComponentProps<typeof Lobby> {
  return {
    roomCode: 'ROOM-1',
    players: readyPlayers,
    playerId: 'player-a',
    hostPlayerId: 'player-a',
    minPlayers: 2,
    maxPlayers: 4,
    busy: false,
    error: null,
    onSetReady: vi.fn(),
    onSetAppearance: vi.fn(),
    onStart: vi.fn(),
    onLeave: vi.fn(),
  };
}

function renderLobby(overrides: Partial<ComponentProps<typeof Lobby>> = {}) {
  const props = { ...makeProps(), ...overrides };
  render(<Lobby {...props} />);
  return props;
}

function seatOf(name: string): HTMLElement {
  const seat = screen.getAllByRole('listitem').find(item => within(item).queryByText(new RegExp(`^${name}`, 'u')));
  if (!seat) throw new Error(`No seat for ${name}`);
  return seat;
}

describe('Lobby header', () => {
  it('shows the room code as the page heading under the "Mã phòng" eyebrow', () => {
    renderLobby({ roomCode: 'GAME-1234' });
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('GAME-1234');
    expect(heading.id).toBe('lobby-title');
    expect(screen.getByText('Mã phòng')).toBeTruthy();
  });

  it('copies the room code and says so, then says when copying is impossible', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderLobby({ roomCode: 'GAME-1234' });

    expect(screen.queryByText('Đã sao chép.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép mã phòng' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('GAME-1234'));
    expect((await screen.findByText('Đã sao chép.')).getAttribute('role')).toBe('status');

    cleanup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép mã phòng' }));
    expect(await screen.findByText('Không thể sao chép tự động; hãy chọn mã phòng ở trên.')).toBeTruthy();
  });

  it('offers settings only when the shell can open them, and leaving unless a request is in flight', () => {
    const props = renderLobby();
    expect(screen.queryByRole('button', { name: 'Cài đặt' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rời phòng' }));
    expect(props.onLeave).toHaveBeenCalledOnce();

    cleanup();
    const withSettings = renderLobby({ onSettings: vi.fn(), busy: true });
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    expect(withSettings.onSettings).toHaveBeenCalledOnce();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Rời phòng' }).disabled).toBe(true);
  });

  it('shows a request error as an alert', () => {
    renderLobby({ error: 'Không thể đổi mascot.' });
    expect(screen.getByRole('alert').textContent).toBe('Không thể đổi mascot.');
  });
});

describe('Lobby start reason', () => {
  const grace = readyPlayers[1];
  const cases: Array<[string, ComponentProps<typeof Lobby>['players'], string]> = [
    ['too few players', [readyPlayers[0]], 'Cần ít nhất 2 người chơi'],
    ['someone is not ready', [readyPlayers[0], { ...grace, ready: false }], 'Chờ mọi người sẵn sàng'],
    ['someone has no mascot', [readyPlayers[0], { ...grace, characterId: null }], 'Có người chưa chọn mascot'],
    ['someone is offline', [readyPlayers[0], { ...grace, connected: false, kind: 'HUMAN' as const }], 'Có người đang mất kết nối'],
    [
      'two players wear the same mascot and color',
      [readyPlayers[0], { ...grace, color: 'red', characterId: 'dog' }],
      'Hai người đang trùng mascot và màu',
    ],
  ];

  it.each(cases)('tells the host why "Bắt đầu" is disabled when %s', (_name, players, reason) => {
    renderLobby({ players });
    const startButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu' });
    const reasonLine = screen.getByText(reason);
    expect(startButton.disabled).toBe(true);
    expect(reasonLine.id).not.toBe('');
    expect(startButton.getAttribute('aria-describedby')).toBe(reasonLine.id);
    expect(startButton.parentElement?.contains(reasonLine)).toBe(true);
  });

  it('shows the first applicable reason when several apply', () => {
    renderLobby({ players: [readyPlayers[0], { ...grace, ready: false, connected: false, kind: 'HUMAN' as const, characterId: null }] });
    expect(screen.getByText('Chờ mọi người sẵn sàng')).toBeTruthy();
    expect(screen.queryByText('Có người chưa chọn mascot')).toBeNull();
    expect(screen.queryByText('Có người đang mất kết nối')).toBeNull();
  });

  it('shows no reason and no description once the lobby can start', () => {
    renderLobby();
    const startButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu' });
    expect(startButton.disabled).toBe(false);
    expect(startButton.hasAttribute('aria-describedby')).toBe(false);
    expect(document.querySelector('.lobby__start-reason')).toBeNull();
  });

  it('disables the button without inventing a reason while a request is in flight', () => {
    renderLobby({ busy: true });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu' }).disabled).toBe(true);
    expect(document.querySelector('.lobby__start-reason')).toBeNull();
  });

  it('keeps the reason to the host: a guest sees neither the button nor the reason', () => {
    renderLobby({ playerId: 'player-b', players: [readyPlayers[0], { ...grace, ready: false }] });
    expect(screen.queryByRole('button', { name: 'Bắt đầu' })).toBeNull();
    expect(document.querySelector('.lobby__start-reason')).toBeNull();
  });

  it('keeps "Bắt đầu" and "sẵn sàng" out of every other button name (the e2e matches by substring)', () => {
    renderLobby({ players: [...readyPlayers, { teamId: 'TEAM_1', teamSlot: 1, id: 'player-c', name: 'Lin', color: 'green', characterId: 'cat', ready: false, connected: true, kind: 'HUMAN' as const }] });
    expect(screen.queryAllByRole('button', { name: /Bắt đầu/iu })).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: /sẵn sàng/iu })).toHaveLength(1);
  });
});

describe('Lobby seats', () => {
  it('fills the empty seats with their number only (no invite helper line)', () => {
    renderLobby();
    const empty = screen.getAllByRole('listitem').filter(item => item.classList.contains('lobby-player--empty'));
    expect(empty).toHaveLength(2);
    expect(within(empty[0]).getByText('Chỗ trống 3')).toBeTruthy();
    expect(within(empty[1]).getByText('Chỗ trống 4')).toBeTruthy();
    expect(screen.queryByText('Chia sẻ mã phòng để mời bạn')).toBeNull();
  });

  it('has no empty-seat hint when all four seats are taken', () => {
    renderLobby({
      players: [
        ...readyPlayers,
        { teamId: 'TEAM_2', teamSlot: 1, id: 'player-c', name: 'Lin', color: 'green', characterId: 'cat', ready: false, connected: true, kind: 'HUMAN' as const },
        { teamId: 'TEAM_1', teamSlot: 1, id: 'player-d', name: 'Sam', color: 'yellow', characterId: 'duck', ready: false, connected: true, kind: 'HUMAN' as const },
      ],
    });
    expect(screen.queryByText('Chia sẻ mã phòng để mời bạn')).toBeNull();
    expect(screen.queryByText(/Chỗ trống/u)).toBeNull();
  });

  it('puts each mascot on a pedestal in the player color and rings only the viewer\'s own seat', () => {
    renderLobby();
    const own = seatOf('Ada');
    const other = seatOf('Grace');
    expect(own.classList.contains('lobby-player--self')).toBe(true);
    expect(other.classList.contains('lobby-player--self')).toBe(false);
    expect(own.querySelector('.lobby-player__disc')?.getAttribute('aria-label')).toBe('Màu Đỏ');
    expect(other.querySelector('.lobby-player__disc')?.getAttribute('aria-label')).toBe('Màu Xanh dương');
    expect(own.style.getPropertyValue('--seat-color')).not.toBe(other.style.getPropertyValue('--seat-color'));
    expect(own.querySelector('.lobby-player__mascot')?.getAttribute('alt')).toBe('');
  });

  it('writes the ready stamp in words, on the element and classes the stylesheet keys on', () => {
    renderLobby({ players: [readyPlayers[0], { ...readyPlayers[1], ready: false }] });
    const ready = within(seatOf('Ada')).getByLabelText('Đã sẵn sàng');
    const waiting = within(seatOf('Grace')).getByLabelText('Chưa sẵn sàng');
    expect(ready.classList.contains('lobby-player__ready-dot--ready')).toBe(true);
    expect(ready.textContent).toBe('Đã sẵn sàng');
    expect(waiting.classList.contains('lobby-player__ready-dot--not-ready')).toBe(true);
    expect(waiting.textContent).toBe('Chưa sẵn sàng');
  });

  it('marks an offline seat with a labelled icon and a dashed, dimmed card', () => {
    renderLobby({ players: [readyPlayers[0], { ...readyPlayers[1], connected: false, kind: 'HUMAN' as const }] });
    const offline = seatOf('Grace');
    expect(offline.classList.contains('lobby-player--disconnected')).toBe(true);
    expect(within(offline).getByLabelText('Mất kết nối')).toBeTruthy();
    expect(seatOf('Ada').classList.contains('lobby-player--disconnected')).toBe(false);
  });

  it('gives the host badge to the host seat only', () => {
    renderLobby();
    expect(within(seatOf('Ada')).getByText('Chủ phòng')).toBeTruthy();
    expect(within(seatOf('Grace')).queryByText('Chủ phòng')).toBeNull();
  });

  it('gives only the viewer\'s own seat a ready button, and that button toggles readiness', () => {
    const props = renderLobby();
    expect(within(seatOf('Grace')).queryByRole('button', { name: /sẵn sàng/iu })).toBeNull();
    fireEvent.click(within(seatOf('Ada')).getByRole('button', { name: 'Hủy sẵn sàng' }));
    expect(props.onSetReady).toHaveBeenCalledWith(false);
  });

  it('disables the own ready button while offline or while a request is in flight', () => {
    renderLobby({ players: [{ ...readyPlayers[0], ready: false, connected: false, kind: 'HUMAN' as const }, readyPlayers[1]] });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sẵn sàng' }).disabled).toBe(true);

    cleanup();
    renderLobby({ players: [{ ...readyPlayers[0], ready: false }, readyPlayers[1]], busy: true });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sẵn sàng' }).disabled).toBe(true);
  });

  it('explains the disabled ready button in visible words, not only a tooltip', () => {
    renderLobby({ players: [{ ...readyPlayers[0], ready: false, characterId: null }, readyPlayers[1]] });
    const readyButton = screen.getByRole('button', { name: 'Sẵn sàng' });
    const hint = within(seatOf('Ada')).getByText('Chọn mascot trước để sẵn sàng');
    expect(readyButton.getAttribute('aria-describedby')).toBe(hint.id);
    expect(screen.getByText('?').getAttribute('aria-hidden')).toBe('true');
  });

  it('never shows a mascot name as text or as a tooltip, in any language', () => {
    renderLobby();
    for (const id of CHARACTER_IDS) {
      expect(screen.queryByText(CHARACTER_REGISTRY[id].accessibleLabel)).toBeNull();
    }
    const titles = [...document.querySelectorAll('[title]')].map(element => element.getAttribute('title'));
    for (const id of CHARACTER_IDS) {
      expect(titles).not.toContain(CHARACTER_REGISTRY[id].accessibleLabel);
    }
  });

  it('has no mascot picker for a viewer without a seat', () => {
    renderLobby({ playerId: 'nobody' });
    expect(screen.queryByLabelText('Chọn nhân vật của bạn')).toBeNull();
  });
});

describe('Lobby kick (Solo)', () => {
  it('gives the host an X on every other seat, named after the player, and none on their own', () => {
    renderLobby({ onKickPlayer: vi.fn() });

    expect(within(seatOf('Grace')).getByRole('button', { name: 'Mời Grace ra khỏi phòng' })).toBeTruthy();
    expect(within(seatOf('Ada')).queryByRole('button', { name: /ra khỏi phòng/u })).toBeNull();
    expect(screen.getAllByRole('button', { name: /ra khỏi phòng/u })).toHaveLength(1);
  });

  it('shows the X to the host only, and only when the lobby can act on it', () => {
    renderLobby({ onKickPlayer: vi.fn(), playerId: 'player-b' });
    expect(screen.queryByRole('button', { name: /ra khỏi phòng/u })).toBeNull();

    cleanup();
    renderLobby();
    expect(screen.queryByRole('button', { name: /ra khỏi phòng/u })).toBeNull();
  });

  it('asks in the central dialog and removes the player only once confirmed', () => {
    const onKickPlayer = vi.fn();
    renderLobby({ onKickPlayer });

    fireEvent.click(screen.getByRole('button', { name: 'Mời Grace ra khỏi phòng' }));
    expect(screen.getByRole('alertdialog', { name: 'Mời Grace ra khỏi phòng?' })).toBeTruthy();
    expect(onKickPlayer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Mời ra' }));
    expect(onKickPlayer).toHaveBeenCalledTimes(1);
    expect(onKickPlayer).toHaveBeenCalledWith('player-b');
  });

  it('disables the X while a request is in flight', () => {
    renderLobby({ onKickPlayer: vi.fn(), busy: true });

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Mời Grace ra khỏi phòng' }).disabled).toBe(true);
  });

  it('keeps the offline mark and the X in different corners of a seat', () => {
    renderLobby({ onKickPlayer: vi.fn(), players: [readyPlayers[0], { ...readyPlayers[1], connected: false, kind: 'HUMAN' as const }] });

    const seat = seatOf('Grace');
    expect(seat.classList.contains('lobby-player--kickable')).toBe(true);
    expect(within(seat).getByLabelText('Mất kết nối')).toBeTruthy();
    expect(within(seat).getByRole('button', { name: 'Mời Grace ra khỏi phòng' })).toBeTruthy();
  });
});

describe('Lobby bot seats', () => {
  const bot = {
    id: 'bot-1', name: 'Bot 1', color: 'green' as const, characterId: 'cat' as const, teamId: 'TEAM_1' as const,
    teamSlot: 1 as const, ready: true, connected: true, kind: 'BOT' as const,
  };

  it('marks a bot seat with a Bot badge, as Ready and present, and no ready button', () => {
    renderLobby({ players: [...readyPlayers, bot] });
    const seat = seatOf('Bot 1');
    expect(seat.getAttribute('data-kind')).toBe('BOT');
    expect(within(seat).getByText('Bot')).toBeTruthy();
    expect(within(seat).getByLabelText('Đã sẵn sàng')).toBeTruthy();
    expect(within(seat).queryByLabelText('Mất kết nối')).toBeNull();
    expect(within(seat).queryByRole('button', { name: /sẵn sàng/u })).toBeNull();
    expect(seatOf('Ada').getAttribute('data-kind')).toBe('HUMAN');
  });

  it('gives only the host an Add bot key on each empty seat, one call per click', () => {
    const onAddBot = vi.fn();
    renderLobby({ onAddBot });
    const keys = screen.getAllByRole('button', { name: /Thêm Bot vào chỗ trống/u });
    expect(keys).toHaveLength(2);
    fireEvent.click(keys[0]);
    expect(onAddBot).toHaveBeenCalledTimes(1);
    expect(onAddBot).toHaveBeenCalledWith();

    cleanup();
    renderLobby({ onAddBot, playerId: 'player-b' });
    expect(screen.queryByRole('button', { name: /Thêm Bot/u })).toBeNull();
  });

  it('hides Add bot when the room is full and disables it while a request is in flight', () => {
    renderLobby({ onAddBot: vi.fn(), busy: true });
    expect(screen.getAllByRole<HTMLButtonElement>('button', { name: /Thêm Bot vào chỗ trống/u }).every(key => key.disabled)).toBe(true);

    cleanup();
    renderLobby({ onAddBot: vi.fn(), players: [...readyPlayers, bot, { ...bot, id: 'bot-2', name: 'Bot 2', characterId: 'duck' as const }] });
    expect(screen.queryByRole('button', { name: /Thêm Bot/u })).toBeNull();
  });

  it('removes a bot from its X at once, without the kick question', () => {
    const onRemoveBot = vi.fn();
    const onKickPlayer = vi.fn();
    renderLobby({ players: [...readyPlayers, bot], onRemoveBot, onKickPlayer });
    fireEvent.click(within(seatOf('Bot 1')).getByRole('button', { name: 'Xóa Bot 1' }));
    expect(onRemoveBot).toHaveBeenCalledWith('bot-1');
    expect(onKickPlayer).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('lets a host with one bot start: the bot never blocks the start', () => {
    const onStart = vi.fn();
    renderLobby({ players: [readyPlayers[0], bot], onStart });
    const startButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu' });
    expect(startButton.disabled).toBe(false);
    fireEvent.click(startButton);
    expect(onStart).toHaveBeenCalledOnce();
  });
});

describe('Lobby LAN invitation', () => {
  const status: HostRuntimeStatus = {
    state: 'HOSTING',
    platform: 'win32',
    appVersion: '3.0.0',
    gamePort: 53_120,
    localEndpoint: 'http://127.0.0.1:53120',
    lanAvailable: true,
    interfaces: [],
    advertisedEndpoints: ['http://192.168.1.15:53120'],
    selectedLanUrl: 'http://192.168.1.15:53120',
  };

  function installBridge() {
    window.ownTheBlockDesktop = {
      host: {
        getStatus: vi.fn(() => Promise.resolve(status)),
        refreshNetwork: vi.fn(() => Promise.resolve(status)),
        onStatusChanged: vi.fn(() => () => undefined),
      },
    } as unknown as OwnTheBlockDesktopBridge;
  }

  it('shows the invitation card to the LAN host as a QR code and a copy button, without printing the link', async () => {
    installBridge();
    renderLobby({ showLanSharing: true });

    const image = await screen.findByAltText('Mã QR tham gia phòng ROOM-1');
    expect(image.getAttribute('data-qr-payload')).toBe('http://192.168.1.15:53120/?room=ROOM-1');
    expect(screen.getByRole('button', { name: 'Sao chép liên kết' })).toBeTruthy();
    expect(screen.queryByText('http://192.168.1.15:53120/?room=ROOM-1')).toBeNull();
    expect(screen.queryByLabelText('Mạng chia sẻ')).toBeNull();
  });

  it('keeps it away from guests and from lobbies that are not hosted on this machine', () => {
    installBridge();
    renderLobby({ showLanSharing: true, playerId: 'player-b' });
    expect(screen.queryByText('Mời qua mạng LAN')).toBeNull();

    cleanup();
    renderLobby();
    expect(screen.queryByText('Mời qua mạng LAN')).toBeNull();
  });
});

describe('Lobby bot difficulty', () => {
  const bot = {
    id: 'bot-1', name: 'Bot 1', color: 'green' as const, characterId: 'cat' as const, teamId: 'TEAM_1' as const,
    teamSlot: 1 as const, ready: true, connected: true, kind: 'BOT' as const,
  };

  it('shows the five levels only once a bot is seated, Medium by default, and sends the host choice', () => {
    const onSetBotDifficulty = vi.fn();
    renderLobby({ onSetBotDifficulty });
    expect(screen.queryByLabelText('Độ khó của Bot')).toBeNull();

    cleanup();
    renderLobby({ players: [...readyPlayers, bot], onSetBotDifficulty });
    const select = screen.getByLabelText<HTMLSelectElement>('Độ khó của Bot');
    expect([...select.options].map(option => option.text)).toEqual(['Cực dễ', 'Dễ', 'Trung bình', 'Khó', 'Cực khó']);
    expect(select.value).toBe('MEDIUM');
    fireEvent.change(select, { target: { value: 'VERY_HARD' } });
    expect(onSetBotDifficulty).toHaveBeenCalledWith('VERY_HARD');
  });

  it('shows a guest the room difficulty without letting them change it', () => {
    renderLobby({ players: [...readyPlayers, bot], playerId: 'player-b', botDifficulty: 'EASY', onSetBotDifficulty: vi.fn() });
    const select = screen.getByLabelText<HTMLSelectElement>('Độ khó của Bot');
    expect(select.value).toBe('EASY');
    expect(select.disabled).toBe(true);
  });
});
