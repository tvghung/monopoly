import type { ReactNode } from 'react';
import {
  cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppErrorBoundary from '../app/screens/AppErrorBoundary';
import BootstrapErrorScreen from '../app/screens/BootstrapErrorScreen';
import ErrorScreen from '../app/screens/ErrorScreen';
import LoadingScreen, { type LoadingStage } from '../app/screens/LoadingScreen';
import ConnectionOverlay from '../components/ConnectionOverlay';
import JoinForm from '../components/JoinForm';
import Lobby from '../components/Lobby';
import { HowToPlayProvider } from './HowToPlayProvider';

// The lobby imports the LAN sharing card, which draws a QR code with a browser-only library.
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,lobby')) } }));

afterEach(cleanup);

const GUIDE = 'Hướng dẫn chơi';
const withGuide = (node: ReactNode) => <HowToPlayProvider>{node}</HowToPlayProvider>;
const key = () => screen.getByRole('button', { name: GUIDE });
const guideOpen = () => screen.queryByRole('dialog', { name: GUIDE }) !== null;

const LOADING_STAGES: LoadingStage[] = [
  'loading-settings', 'loading-runtime-config', 'loading-assets', 'initializing-client', 'restoring',
];

const players = [
  { id: 'player-a', name: 'Ada', color: 'red' as const, characterId: 'dog' as const, teamId: 'TEAM_1' as const, teamSlot: 0 as const, ready: true, connected: true },
  { id: 'player-b', name: 'Grace', color: 'blue' as const, characterId: 'panda' as const, teamId: 'TEAM_2' as const, teamSlot: 0 as const, ready: false, connected: true },
];

function lobby(overrides: { hostPlayerId?: string; onSettings?: () => void } = {}) {
  return (
    <Lobby
      roomCode="ROOM-1"
      players={players}
      playerId="player-a"
      hostPlayerId={overrides.hostPlayerId ?? 'player-a'}
      minPlayers={2}
      maxPlayers={4}
      busy={false}
      error={null}
      onSetReady={vi.fn()}
      onSetAppearance={vi.fn()}
      onStart={vi.fn()}
      onLeave={vi.fn()}
      onSettings={overrides.onSettings}
    />
  );
}

describe('the how-to-play key on every screen', () => {
  describe('loading', () => {
    it.each(LOADING_STAGES)('is pinned to the corner of the %s screen, outside its status line', (stage) => {
      const { container } = render(withGuide(<LoadingScreen stage={stage} />));

      expect(key().className).toContain('how-to-play-button--corner');
      // The one status line still says what is happening and nothing more.
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.getByRole('status').contains(key())).toBe(false);
      expect(container.querySelector('.app-screen--loading')?.contains(key())).toBe(true);
    });

    it('opens the guide from the key', () => {
      render(withGuide(<LoadingScreen as="section" stage="restoring" />));
      fireEvent.click(key());
      expect(guideOpen()).toBe(true);
    });

    it('shows nothing extra where no guide can open (an isolated render)', () => {
      render(<LoadingScreen stage="loading-assets" />);
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('failures', () => {
    it('is on the error screen with or without an action, and the action stays the first button', () => {
      const onClick = vi.fn();
      const { rerender } = render(withGuide(
        <ErrorScreen title="Lỗi" message="Có lỗi." action={{ label: 'Thử lại', icon: <span aria-hidden="true" />, onClick }} />,
      ));
      const buttons = screen.getAllByRole('button');
      expect(buttons.map(button => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Thử lại', GUIDE]);
      expect(key().className).toContain('how-to-play-button--corner');
      fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
      expect(onClick).toHaveBeenCalledOnce();

      // A dead end (a session opened elsewhere) still has the guide to read.
      rerender(withGuide(<ErrorScreen as="section" title="Phiên chơi đã được mở ở nơi khác" message="Hãy dùng cửa sổ kia." />));
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(key()).toBeTruthy();
    });

    it('is on the start-up failure screen', () => {
      render(withGuide(<BootstrapErrorScreen onRetry={vi.fn()} />));
      expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
      fireEvent.click(key());
      expect(guideOpen()).toBe(true);
    });

    it('stays out of an isolated failure screen, which keeps its old buttons', () => {
      render(<ErrorScreen title="Lỗi" message="Có lỗi." />);
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('is on the render failure screen, which brings its own provider because the app is gone', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      function Broken(): never {
        throw new Error('secret technical exception');
      }
      render(<AppErrorBoundary reload={vi.fn()}><Broken /></AppErrorBoundary>);

      expect(screen.getByRole('heading', { name: 'Không thể hiển thị trò chơi' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Tải lại trò chơi' })).toBeTruthy();
      fireEvent.click(key());
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(guideOpen()).toBe(true);
      expect(screen.queryByText('secret technical exception')).toBeNull();
      consoleError.mockRestore();
    });
  });

  describe('reconnecting', () => {
    it('is on the overlay beside the status, not inside what is announced', () => {
      const { container } = render(withGuide(<ConnectionOverlay />));
      const overlay = container.querySelector('.connection-overlay') as HTMLElement;
      const status = within(overlay).getByRole('status');

      expect(status.textContent).toBe('Đã mất kết nối. Đang kết nối lại vào ván chơi…');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.contains(key())).toBe(false);
      expect(overlay.contains(key())).toBe(true);
      expect(key().className).toContain('how-to-play-button--corner');
      expect(overlay.querySelector('.connection-overlay__card.ds-panel')).not.toBeNull();
    });

    it('opens the guide from the overlay', () => {
      render(withGuide(<ConnectionOverlay message="Đang thử lại" />));
      fireEvent.click(key());
      expect(guideOpen()).toBe(true);
    });

    it('stays out of an isolated overlay', () => {
      render(<ConnectionOverlay />);
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('join form', () => {
    it('sits under the mascot row beside the title, not in the card, as a labelled key that never submits anything', () => {
      const onJoin = vi.fn();
      render(withGuide(<JoinForm onJoin={onJoin} busy={false} connected error={null} />));
      const hero = document.querySelector('.join__hero') as HTMLElement;
      const form = document.querySelector('form.join__form') as HTMLFormElement;

      expect(hero.contains(key())).toBe(true);
      expect(form.contains(key())).toBe(false);
      expect(hero.lastElementChild).toBe(key());
      expect(key().textContent).toBe(GUIDE);
      expect(key().getAttribute('type')).toBe('button');
      expect(key().className).toContain('join__help');
      // The card keeps exactly the join button.
      expect(within(form).getAllByRole('button').map(button => button.textContent)).toEqual(['Vào phòng']);

      fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
      fireEvent.click(key());
      expect(guideOpen()).toBe(true);
      expect(onJoin).not.toHaveBeenCalled();
    });

    it('keeps the join form as it was where no guide can open', () => {
      render(<JoinForm onJoin={vi.fn()} busy={false} connected error={null} />);
      expect(screen.queryByRole('button', { name: GUIDE })).toBeNull();
    });
  });

  describe('lobby', () => {
    it('is the first key of the header actions, for a host and for a guest', () => {
      const { unmount } = render(withGuide(lobby({ onSettings: vi.fn() })));
      let actions = document.querySelector('.lobby__header-actions') as HTMLElement;
      expect(within(actions).getAllByRole('button').map(button => button.textContent)).toEqual([GUIDE, 'Cài đặt', 'Rời phòng', 'Bắt đầu']);
      unmount();

      render(withGuide(lobby({ hostPlayerId: 'player-b' })));
      actions = document.querySelector('.lobby__header-actions') as HTMLElement;
      expect(within(actions).getAllByRole('button').map(button => button.textContent)).toEqual([GUIDE, 'Rời phòng']);
    });

    it('opens the guide and leaves the lobby alone', () => {
      render(withGuide(lobby()));
      fireEvent.click(key());
      expect(guideOpen()).toBe(true);
      expect(screen.getByRole('heading', { name: 'ROOM-1' })).toBeTruthy();
    });

    it('keeps the header as it was where no guide can open', () => {
      render(lobby());
      expect(screen.queryByRole('button', { name: GUIDE })).toBeNull();
      const actions = document.querySelector('.lobby__header-actions') as HTMLElement;
      expect(within(actions).getAllByRole('button').map(button => button.textContent)).toEqual(['Rời phòng', 'Bắt đầu']);
    });
  });
});
