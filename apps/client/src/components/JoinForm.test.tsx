import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTER_REGISTRY, LEGACY_CHARACTER_DEFINITION } from '../game/characters/characterRegistry';
import JoinForm from './JoinForm';

afterEach(cleanup);

function renderForm(overrides: Partial<Parameters<typeof JoinForm>[0]> = {}) {
  const onJoin = vi.fn();
  const view = render(<JoinForm onJoin={onJoin} busy={false} connected error={null} {...overrides} />);
  return { onJoin, ...view };
}

const nameInput = () => screen.getByLabelText<HTMLInputElement>('Tên của bạn');
const joinButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /Vào phòng|Đang vào phòng/u });
const modeRadio = (name: string) => screen.getByRole('radio', { name });

describe('JoinForm room mode', () => {
  it('starts on "Có mã phòng" with the code field, its placeholder and focus on the name', () => {
    renderForm();

    expect(screen.getByRole('radiogroup', { name: 'Loại phòng' })).toBeTruthy();
    expect(modeRadio('Có mã phòng').getAttribute('aria-checked')).toBe('true');
    expect(modeRadio('Phòng chung').getAttribute('aria-checked')).toBe('false');
    const room = screen.getByLabelText<HTMLInputElement>('Mã phòng');
    expect(room.id).toBe('join-room');
    expect(room.placeholder).toBe('Ví dụ: GAME-1234');
    expect(room.maxLength).toBe(20);
    expect(nameInput().id).toBe('join-name');
    expect(nameInput().maxLength).toBe(20);
    expect(nameInput().getAttribute('enterkeyhint')).toBe('next');
    expect(document.activeElement).toBe(nameInput());
  });

  it('joins the typed room code, trimmed and upper-cased', () => {
    const { onJoin } = renderForm();

    fireEvent.change(nameInput(), { target: { value: '  Ada ' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: ' room-42 ' } });
    fireEvent.click(joinButton());

    expect(onJoin).toHaveBeenCalledOnce();
    expect(onJoin).toHaveBeenCalledWith('Ada', 'ROOM-42');
  });

  it('keeps an empty code joining the public room, as before the mode toggle existed', () => {
    const { onJoin } = renderForm();

    fireEvent.change(nameInput(), { target: { value: 'Ada' } });
    fireEvent.click(joinButton());

    expect(onJoin).toHaveBeenCalledOnce();
    expect(onJoin).toHaveBeenCalledWith('Ada', 'LOBBY');
  });

  it('hides the code field in "Phòng chung" and joins LOBBY even when a code was typed before', () => {
    const { onJoin } = renderForm();
    fireEvent.change(nameInput(), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'room-42' } });

    fireEvent.click(modeRadio('Phòng chung'));

    expect(modeRadio('Phòng chung').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText('Mã phòng')).toBeNull();
    expect(screen.queryByText('Mọi người chọn Phòng chung đều vào cùng một phòng.')).toBeNull();
    expect(nameInput().getAttribute('enterkeyhint')).toBe('go');
    fireEvent.click(joinButton());
    expect(onJoin).toHaveBeenCalledOnce();
    expect(onJoin).toHaveBeenCalledWith('Ada', 'LOBBY');
  });

  it('keeps the typed code when the player switches to the public room and back', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'game-7' } });

    fireEvent.click(modeRadio('Phòng chung'));
    fireEvent.click(modeRadio('Có mã phòng'));

    expect(screen.getByLabelText<HTMLInputElement>('Mã phòng').value).toBe('game-7');
  });

  it('selects "Có mã phòng" and fills the field for an invitation link, without submitting', () => {
    const { onJoin } = renderForm({ initialRoomCode: 'OTB-ABC234', initialMode: 'public' });

    expect(modeRadio('Có mã phòng').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText<HTMLInputElement>('Mã phòng').value).toBe('OTB-ABC234');
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('can open on "Phòng chung" for the design lab', () => {
    renderForm({ initialMode: 'public' });

    expect(modeRadio('Phòng chung').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText('Mã phòng')).toBeNull();
  });
});

describe('JoinForm submit rules', () => {
  it('disables "Vào phòng" until a name is typed and says why in writing', () => {
    renderForm();

    expect(joinButton().disabled).toBe(true);
    const reason = screen.getByText('Nhập tên của bạn để vào phòng.');
    expect(joinButton().getAttribute('aria-describedby')).toBe(reason.id);

    fireEvent.change(nameInput(), { target: { value: '   ' } });
    expect(joinButton().disabled).toBe(true);

    fireEvent.change(nameInput(), { target: { value: 'Ada' } });
    expect(joinButton().disabled).toBe(false);
    expect(screen.queryByText('Nhập tên của bạn để vào phòng.')).toBeNull();
    expect(joinButton().getAttribute('aria-describedby')).toBeNull();
  });

  it('keeps the button disabled while the socket is connecting and shows the status line', () => {
    renderForm({ connected: false });
    fireEvent.change(nameInput(), { target: { value: 'Ada' } });

    expect(joinButton().disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Đang kết nối đến máy chủ trò chơi…');
  });

  it('shows "Đang vào phòng…" and stays disabled while joining', () => {
    renderForm({ busy: true });
    fireEvent.change(nameInput(), { target: { value: 'Ada' } });

    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Đang vào phòng…' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces a failure as an alert', () => {
    renderForm({ error: 'Không thể vào phòng. Hãy thử lại.' });

    expect(screen.getByRole('alert').textContent).toBe('Không thể vào phòng. Hãy thử lại.');
  });
});

describe('JoinForm "Quay lại"', () => {
  const back = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Quay lại' });

  it('has no back button where there is no screen before this one (a plain browser)', () => {
    renderForm();

    expect(screen.queryByRole('button', { name: 'Quay lại' })).toBeNull();
  });

  it('puts "Quay lại" first on the page, before the title and outside the card, as a secondary action', () => {
    const { container } = renderForm({ onBack: vi.fn() });

    expect(back().type).toBe('button');
    expect(back().className).toContain('ds-button--ghost');
    expect(joinButton().className).not.toContain('ds-button--ghost');
    expect(back().closest('.join__hero')).not.toBeNull();
    expect(back().closest('.join__panel')).toBeNull();
    // First in the tab order too, like the back key of a browser; the card keeps its one action.
    expect(container.querySelector('button')).toBe(back());
    expect(container.querySelector('.join__panel .join__back')).toBeNull();
  });

  it('goes back once, and does not submit the form or join anything', () => {
    const onBack = vi.fn();
    const { onJoin } = renderForm({ onBack });
    fireEvent.change(nameInput(), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'room-42' } });

    fireEvent.click(back());

    expect(onBack).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledWith();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('still joins with Enter in a field when a back button is there', () => {
    const { onJoin } = renderForm({ onBack: vi.fn() });
    fireEvent.change(nameInput(), { target: { value: 'Ada' } });

    fireEvent.submit(nameInput().closest('form') as HTMLFormElement);

    expect(onJoin).toHaveBeenCalledExactlyOnceWith('Ada', 'LOBBY');
  });

  it('stays usable while joining, and while the connection or the name is missing', () => {
    renderForm({ onBack: vi.fn(), busy: true, connected: false });

    expect(back().disabled).toBe(false);
    expect(joinButton().disabled).toBe(true);
  });

  it('opens with the name and the room code the player already typed, and joins with them without typing again', () => {
    const { onJoin } = renderForm({ onBack: vi.fn(), initialName: 'Ada', initialRoomCode: 'LAN-42' });

    expect(nameInput().value).toBe('Ada');
    expect(screen.getByLabelText<HTMLInputElement>('Mã phòng').value).toBe('LAN-42');
    expect(modeRadio('Có mã phòng').getAttribute('aria-checked')).toBe('true');
    // A name is already there, so the button is usable and no reason is written under it.
    expect(joinButton().disabled).toBe(false);
    expect(screen.queryByText('Nhập tên của bạn để vào phòng.')).toBeNull();

    fireEvent.click(joinButton());
    expect(onJoin).toHaveBeenCalledExactlyOnceWith('Ada', 'LAN-42');
  });

  it('keeps starting empty when nothing was typed before (the web landing)', () => {
    renderForm({ onBack: vi.fn() });

    expect(nameInput().value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Mã phòng').value).toBe('');
  });
});

describe('JoinForm hero', () => {
  it('keeps the page heading and labels the landing region with it', () => {
    renderForm();

    const heading = screen.getByRole('heading', { level: 1, name: 'Phiên bản Việt Nam' });
    expect(heading.id).toBe('join-title');
    expect(screen.getByRole('region', { name: 'Phiên bản Việt Nam' })).toBeTruthy();
    expect(screen.getByText('OWN THE BLOCK').getAttribute('aria-hidden')).toBe('true');
  });

  it('is decoration: eight mascots with empty alt text, hidden from assistive technology, never named', () => {
    const { container } = renderForm();

    const hero = container.querySelector('.join-hero');
    expect(hero?.getAttribute('aria-hidden')).toBe('true');
    const mascots = [...(hero?.querySelectorAll('img') ?? [])];
    expect(mascots).toHaveLength(8);
    for (const mascot of mascots) expect(mascot.getAttribute('alt')).toBe('');
    // No tooltip anywhere on the page, and no mascot name as visible text or as an accessible label.
    expect(container.querySelectorAll('[title]')).toHaveLength(0);
    for (const definition of [...Object.values(CHARACTER_REGISTRY), LEGACY_CHARACTER_DEFINITION]) {
      expect(screen.queryByText(definition.accessibleLabel)).toBeNull();
      expect(screen.queryByLabelText(definition.accessibleLabel)).toBeNull();
    }
    expect(hero?.textContent).toBe('');
  });
});
