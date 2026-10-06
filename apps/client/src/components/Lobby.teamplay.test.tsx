import {
  cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicTeam } from '@monopoly/shared';
import Lobby, { type LobbyPlayerView } from './Lobby';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,lobby')) } }));

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
});

// Ada (host) and Chi are "Team 1" in red, Grace and Dũng are "Team 2" in blue.
const players: LobbyPlayerView[] = [
  { id: 'player-a', name: 'Ada', teamId: 'TEAM_1', color: 'red', characterId: 'dog', ready: true, connected: true },
  { id: 'player-b', name: 'Grace', teamId: 'TEAM_2', color: 'blue', characterId: 'panda', ready: true, connected: true },
  { id: 'player-c', name: 'Chi', teamId: 'TEAM_1', color: 'red', characterId: 'cat', ready: true, connected: true },
  { id: 'player-d', name: 'Dũng', teamId: 'TEAM_2', color: 'blue', characterId: 'duck', ready: true, connected: true },
];

const teams: PublicTeam[] = [
  { teamId: 'TEAM_1', name: 'Rồng', color: 'red', memberPlayerIds: ['player-a', 'player-c'] },
  { teamId: 'TEAM_2', name: 'Phượng', color: 'blue', memberPlayerIds: ['player-b', 'player-d'] },
];

function setup(overrides: Partial<ComponentProps<typeof Lobby>> = {}) {
  const handlers = {
    onSetReady: vi.fn(),
    onSetAppearance: vi.fn(),
    onSetGameMode: vi.fn(),
    onSetTeamName: vi.fn(),
    onSetTeamColor: vi.fn(),
    onSwapTeams: vi.fn(),
    onStart: vi.fn(),
    onLeave: vi.fn(),
  };
  const view = render(
    <Lobby
      roomCode="ROOM-1"
      players={players}
      playerId="player-a"
      hostPlayerId="player-a"
      minPlayers={2}
      maxPlayers={4}
      gameMode="TEAM_2V2"
      teams={teams}
      busy={false}
      error={null}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...view, handlers };
}

/** The banner shown while the host is choosing the second player of a swap. */
const swapBanner = () => document.querySelector<HTMLElement>('.lobby__swap-banner');

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

  it('keeps the Solo lobby free of any team zone', () => {
    setup({ gameMode: 'SOLO', teams: [] });

    expect(document.querySelectorAll('.lobby-team')).toHaveLength(0);
    expect(screen.getByRole('list', { name: 'Danh sách người chơi' })).toBeTruthy();
  });
});

describe('Lobby team zones', () => {
  it('shows two named teams with their members and marks the viewer\'s own team', () => {
    setup({ playerId: 'player-c' });

    const rong = screen.getByRole('region', { name: 'Rồng' });
    const phuong = screen.getByRole('region', { name: 'Phượng' });
    expect(within(rong).getByRole('list', { name: 'Người chơi của đội Rồng' }).textContent).toContain('Ada');
    expect(within(rong).getByRole('list', { name: 'Người chơi của đội Rồng' }).textContent).toContain('Chi (bạn)');
    expect(within(phuong).getByRole('list', { name: 'Người chơi của đội Phượng' }).textContent).toContain('Grace');
    expect(within(rong).getByText('Đội của bạn')).toBeTruthy();
    expect(within(phuong).queryByText('Đội của bạn')).toBeNull();
    expect(within(rong).getByLabelText('2 trên 2 người')).toBeTruthy();
  });

  it('shows the empty seats of a team that is not full', () => {
    setup({ players: players.slice(0, 3), teams });

    expect(within(screen.getByRole('region', { name: 'Phượng' })).getByText('Chỗ trống 2')).toBeTruthy();
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
    // Grace (Team 2) wears the panda; that is still free for Ada, whose teammate Chi wears the cat.
    const panda = screen.getAllByRole('button').find(button => /^Gấu trúc$/u.test(button.getAttribute('aria-label') ?? ''));
    expect(panda?.hasAttribute('disabled')).toBe(false);
    fireEvent.click(panda!);
    expect(handlers.onSetAppearance).toHaveBeenCalledWith({ characterId: 'panda' });
  });
});

describe('Lobby team name and colour', () => {
  it('lets the host rename either team on Enter without touching anyone\'s Ready', () => {
    const { handlers } = setup();

    const [first] = screen.getAllByLabelText('Tên đội');
    fireEvent.change(first, { target: { value: 'Hổ Vàng' } });
    fireEvent.keyDown(first, { key: 'Enter' });

    expect(handlers.onSetTeamName).toHaveBeenCalledWith('TEAM_1', 'Hổ Vàng');
    expect(handlers.onSetReady).not.toHaveBeenCalled();
  });

  it('puts the old name back on Escape and never sends an empty name', () => {
    const { handlers } = setup();

    const [first] = screen.getAllByLabelText<HTMLInputElement>('Tên đội');
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
    expect(screen.getAllByLabelText<HTMLInputElement>('Tên đội')[0].maxLength).toBe(20);
  });

  it('gives a guest no name editor', () => {
    setup({ playerId: 'player-b' });
    expect(screen.queryByLabelText('Tên đội')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Rồng' })).toBeTruthy();
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
    expect(within(screen.getByRole('region', { name: 'Phượng' })).getByText(/Màu đội:/u)).toBeTruthy();
  });
});

describe('Lobby host swap flow', () => {
  it('swaps two players with an explicit pick, never with a drag', () => {
    const { handlers } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Đổi đội của Chi' }));
    expect(swapBanner()?.textContent).toContain('Chọn người chơi ở đội kia để đổi chỗ với Chi');
    expect(screen.getByRole('button', { name: 'Hủy đổi đội của Chi' }).getAttribute('aria-pressed')).toBe('true');
    // The other team's seats become the valid partners; the chosen player's own team has none.
    expect(screen.queryByRole('button', { name: 'Đổi đội của Ada' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Đổi chỗ Grace với Chi' }));

    expect(handlers.onSwapTeams).toHaveBeenCalledWith('player-c', 'player-b');
    expect(screen.queryByRole('button', { name: 'Hủy đổi đội của Chi' })).toBeNull();
    expect(document.querySelector('[draggable="true"]')).toBeNull();
  });

  it('cancels with Escape, with the chosen seat again and with the Hủy button', () => {
    const { handlers } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Đổi đội của Ada' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(swapBanner()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Đổi đội của Ada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy đổi đội của Ada' }));
    expect(swapBanner()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Đổi đội của Ada' }));
    fireEvent.click(within(swapBanner() as HTMLElement).getByRole('button', { name: 'Hủy' }));
    expect(swapBanner()).toBeNull();
    expect(handlers.onSwapTeams).not.toHaveBeenCalled();
  });

  it('is host-only: a guest sees no swap control at all', () => {
    setup({ playerId: 'player-b' });
    expect(screen.queryByRole('button', { name: /Đổi đội của/u })).toBeNull();
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
    const threeToOne = players.map(player => (player.id === 'player-d' ? { ...player, teamId: 'TEAM_1' as const, color: 'red' as const } : player));
    setup({ players: threeToOne });

    expect(screen.getByRole('button', { name: 'Bắt đầu' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Mỗi đội cần đúng 2 người chơi')).toBeTruthy();
  });

  it('shows a guest no start button', () => {
    setup({ playerId: 'player-b' });
    expect(screen.queryByRole('button', { name: 'Bắt đầu' })).toBeNull();
  });
});
