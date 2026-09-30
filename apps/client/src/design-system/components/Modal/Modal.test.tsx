import { useState } from 'react';
import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../../settings/SettingsProvider';
import { DEFAULT_GAME_SETTINGS } from '../../../settings/defaults';
import ConfirmationDialog from '../ConfirmationDialog/ConfirmationDialog';
import Modal, { type ModalProps } from './Modal';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

type Extra = Partial<Omit<ModalProps, 'open' | 'title' | 'children'>>;

function Harness({ extra = {}, initiallyOpen = true }: { extra?: Extra; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Mở hộp thoại</button>
      <Modal open={open} title="Tiêu đề" onClose={() => setOpen(false)} {...extra}>
        <p>Nội dung</p>
        <button type="button">Nút trong hộp thoại</button>
      </Modal>
    </>
  );
}

const dialog = () => screen.queryByRole('dialog');

describe('Modal v2 props', () => {
  it('renders title, eyebrow, body and the sticky footer slot', () => {
    render(
      <Modal open title="Mua Cần Thơ?" eyebrow="Ô đất trống" footer={<button type="button">Mua tài sản</button>}>
        <p>Nội dung</p>
      </Modal>,
    );
    const card = screen.getByRole('dialog', { name: 'Mua Cần Thơ?' });
    expect(card.querySelector('.ds-modal__eyebrow')?.textContent).toBe('Ô đất trống');
    expect(card.querySelector('.ds-modal__body')?.textContent).toBe('Nội dung');
    expect(card.querySelector('.ds-modal__footer')?.textContent).toBe('Mua tài sản');
    expect(card.querySelector('.ds-modal__close')).toBeNull();
  });

  it.each([
    ['sm', 'ds-modal--sm'], ['md', 'ds-modal--md'], ['lg', 'ds-modal--lg'], ['xl', 'ds-modal--xl'],
  ] as const)('maps size %s to %s and defaults to md', (size, className) => {
    const { unmount } = render(<Modal open title="Hộp" size={size}>.</Modal>);
    expect(screen.getByRole('dialog').className).toContain(className);
    unmount();
    render(<Modal open title="Hộp">.</Modal>);
    expect(screen.getByRole('dialog').className).toContain('ds-modal--md');
  });

  it('supports the sheet placement, the clear backdrop, the card layer, the tone and the header accent', () => {
    render(
      <Modal open title="Hộp" placement="sheet" backdrop="clear" layer="card" tone="danger" headerAccent="#1d8fe1">.</Modal>,
    );
    const card = screen.getByRole('dialog');
    const overlay = card.parentElement as HTMLElement;
    expect(card.className).toContain('ds-modal--sheet');
    expect(card.className).toContain('ds-modal--danger');
    expect(overlay.className).toContain('ds-modal__overlay--sheet');
    expect(overlay.className).toContain('ds-modal__overlay--clear');
    expect(overlay.className).toContain('ds-modal__overlay--card');
    expect(card.querySelector('.ds-modal__accent')).not.toBeNull();
    expect(card.style.getPropertyValue('--ds-modal-accent')).toBe('#1d8fe1');
  });

  it('keeps the previous behavior: the close button only with onClose, Escape and outside click on demand', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open title="Hộp">.</Modal>);
    expect(screen.queryByRole('button', { name: 'Đóng' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    rerender(<Modal open title="Hộp" onClose={onClose}>.</Modal>);
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Modal open title="Hộp" onClose={onClose} closeOnEscape={false} closeOnOutsideClick>.</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('focuses [data-modal-autofocus] first, then the first control', () => {
    const { unmount } = render(
      <Modal open title="Hộp">
        <button type="button">Một</button>
        <button type="button" data-modal-autofocus>Hai</button>
      </Modal>,
    );
    expect(document.activeElement?.textContent).toBe('Hai');
    unmount();
    render(<Modal open title="Hộp"><button type="button">Một</button></Modal>);
    expect(document.activeElement?.textContent).toBe('Một');
  });

  it('traps Tab inside the dialog', () => {
    render(
      <Modal open title="Hộp" footer={<button type="button">Cuối</button>}>
        <button type="button">Đầu</button>
      </Modal>,
    );
    const last = screen.getByRole('button', { name: 'Cuối' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement?.textContent).toBe('Đầu');
  });
});

describe('Modal v2 exit and focus', () => {
  it('animates out: the closing dialog loses aria-modal and becomes inert at once, then leaves the DOM', async () => {
    render(<Harness />);
    const card = screen.getByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));

    expect(card.hasAttribute('aria-modal')).toBe(false);
    expect(card.hasAttribute('inert')).toBe(true);
    expect(card.getAttribute('aria-hidden')).toBe('true');
    expect(dialog()).toBeNull();
    await waitFor(() => expect(card.isConnected).toBe(false));
  });

  it('returns focus to the opener after the exit animation', async () => {
    render(<Harness initiallyOpen={false} />);
    const opener = screen.getByRole('button', { name: 'Mở hộp thoại' });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(dialog()).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('fades in a reduced-motion setting and still closes', async () => {
    window.localStorage.clear();
    render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion: true }}>
        <Harness />
      </SettingsProvider>,
    );
    const card = screen.getByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(card.isConnected).toBe(false));
  });

  it('returns focus into the dialog below when a confirmation opened from it is cancelled', async () => {
    function Stack() {
      const [confirming, setConfirming] = useState(false);
      return (
        <Modal open title="Cần thanh toán" role="alertdialog">
          <button type="button" onClick={() => setConfirming(true)}>Bỏ cuộc</button>
          <ConfirmationDialog
            open={confirming}
            title="Bỏ cuộc khỏi ván chơi?"
            message="Bạn sẽ rời ván chơi."
            confirmLabel="Bỏ cuộc"
            onConfirm={() => setConfirming(false)}
            onCancel={() => setConfirming(false)}
          />
        </Modal>
      );
    }
    render(<Stack />);
    const forfeit = screen.getByRole('button', { name: 'Bỏ cuộc' });
    forfeit.focus();
    fireEvent.click(forfeit);
    await waitFor(() => expect(screen.getByRole('alertdialog', { name: 'Bỏ cuộc khỏi ván chơi?' })).toBeTruthy());
    // The confirmation is the top dialog: Cancel has focus.
    expect(document.activeElement?.textContent).toBe('Hủy');

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(document.activeElement).toBe(forfeit));
    expect(screen.getByRole('alertdialog', { name: 'Cần thanh toán' })).toBeTruthy();
  });

  it('gives Escape to the top dialog only', () => {
    const closeBottom = vi.fn();
    const closeTop = vi.fn();
    render(
      <>
        <Modal open title="Dưới" onClose={closeBottom}>.</Modal>
        <Modal open title="Trên" onClose={closeTop}>.</Modal>
      </>,
    );
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();
  });
});
