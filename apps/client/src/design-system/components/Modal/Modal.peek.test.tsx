import { useState } from 'react';
import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal, { type ModalProps } from './Modal';
import { resetModalPeekForTests, useDecisionHidden } from './modalPeek';

afterEach(() => {
  cleanup();
  resetModalPeekForTests();
  window.localStorage.clear();
});

const eye = (name = 'Xem bàn cờ') => screen.getByRole('button', { name });
const restoreKey = () => screen.queryByRole('button', { name: 'Hiện quyết định' });

/** A dialog with a form, as a decision sheet has: a typed value and a choice must survive hiding. */
function Decision({
  onClose, onCommand, extra = {}, title = 'Mua Cần Thơ?', open = true,
}: {
  onClose?: () => void;
  onCommand?: () => void;
  extra?: Partial<Omit<ModalProps, 'open' | 'title' | 'children'>>;
  title?: string;
  open?: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <Modal open={open} title={title} peek="decision" onClose={onClose} {...extra}>
      <label>
        Giá
        <input value={text} onChange={event => setText(event.target.value)} />
      </label>
      <button type="button" onClick={onCommand}>Mua tài sản</button>
    </Modal>
  );
}

function HiddenProbe() {
  return <p data-testid="decision-hidden">{String(useDecisionHidden())}</p>;
}

describe('Modal peek', () => {
  it('offers the eye key only to a dialog that asks for it', () => {
    const { unmount } = render(<Modal open title="Thường" onClose={() => undefined}>.</Modal>);
    expect(screen.queryByRole('button', { name: 'Xem bàn cờ' })).toBeNull();
    unmount();

    render(<Decision onClose={() => undefined} />);
    expect(eye()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeTruthy();
    expect(restoreKey()).toBeNull();
  });

  it('hides the dialog and its backdrop at once, leaves no layer behind, and shows the floating restore key', () => {
    const onClose = vi.fn();
    const onCommand = vi.fn();
    render(<Decision onClose={onClose} onCommand={onCommand} />);
    const overlay = document.querySelector<HTMLElement>('.ds-modal__overlay');
    expect(overlay?.hidden).toBe(false);

    fireEvent.click(eye());

    expect(overlay?.hidden).toBe(true);
    expect(overlay?.getAttribute('data-peeking')).toBe('true');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mua tài sản' })).toBeNull();
    expect(restoreKey()).toBeTruthy();
    expect(document.body.contains(restoreKey())).toBe(true);
    // Presentation only: nothing was closed, confirmed or sent.
    expect(onClose).not.toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('shows the same dialog again with its typed value, and sends nothing', () => {
    const onClose = vi.fn();
    const onCommand = vi.fn();
    render(<Decision onClose={onClose} onCommand={onCommand} />);
    const input = screen.getByLabelText<HTMLInputElement>('Giá');
    fireEvent.change(input, { target: { value: '150000' } });

    fireEvent.click(eye());
    fireEvent.click(restoreKey() as HTMLElement);

    expect(document.querySelector<HTMLElement>('.ds-modal__overlay')?.hidden).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Mua Cần Thơ?' })).toBeTruthy();
    // The same element, not a rebuilt one.
    expect(screen.getByLabelText<HTMLInputElement>('Giá')).toBe(input);
    expect(input.value).toBe('150000');
    expect(restoreKey()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('moves focus to the restore key when hiding and back to the eye key when showing', async () => {
    render(<Decision />);
    fireEvent.click(eye());
    await waitFor(() => expect(document.activeElement).toBe(restoreKey()));

    fireEvent.click(restoreKey() as HTMLElement);
    await waitFor(() => expect(document.activeElement).toBe(eye()));
  });

  it('ignores Escape while hidden, so the decision cannot be dismissed unseen', () => {
    const onClose = vi.fn();
    render(<Decision onClose={onClose} />);
    fireEvent.click(eye());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(restoreKey()).toBeTruthy();
  });

  it('keeps the restore key and the hidden-decision flag only while it is hidden and mounted', () => {
    const { rerender } = render(<><HiddenProbe /><Decision /></>);
    expect(screen.getByTestId('decision-hidden').textContent).toBe('false');

    fireEvent.click(eye());
    expect(screen.getByTestId('decision-hidden').textContent).toBe('true');

    // The decision went away on the server while it was hidden: no dialog, no key, no flag.
    rerender(<><HiddenProbe /><Decision open={false} /></>);
    expect(restoreKey()).toBeNull();
    expect(screen.getByTestId('decision-hidden').textContent).toBe('false');
  });

  it('does not count a "view" dialog as a hidden decision', () => {
    render(<><HiddenProbe /><Modal open title="Thẻ ô đất" peek="view">.</Modal></>);
    fireEvent.click(eye());

    expect(restoreKey()).toBeTruthy();
    expect(screen.getByTestId('decision-hidden').textContent).toBe('false');
  });

  it('draws one restore key, the one of the dialog hidden last, and gives the next one back in turn', () => {
    render(
      <>
        <Decision title="Mua Cần Thơ?" />
        <Modal open title="Thẻ ô đất" peek="view">.</Modal>
      </>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Xem bàn cờ' })[0]);
    expect(screen.getAllByRole('button', { name: 'Hiện quyết định' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bàn cờ' }));
    expect(screen.getAllByRole('button', { name: 'Hiện quyết định' })).toHaveLength(1);

    // The key on screen belongs to the second dialog: showing it brings back that dialog, and the first one's key follows.
    fireEvent.click(restoreKey() as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Thẻ ô đất' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Mua Cần Thơ?' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Hiện quyết định' })).toHaveLength(1);
    fireEvent.click(restoreKey() as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Mua Cần Thơ?' })).toBeTruthy();
    expect(restoreKey()).toBeNull();
  });

  it('lets the dialog below take Escape and Tab while the top one is hidden', () => {
    const closeBelow = vi.fn();
    const closeTop = vi.fn();
    render(
      <>
        <Modal open title="Dưới" onClose={closeBelow}><button type="button">Nút dưới</button></Modal>
        <Modal open title="Trên" onClose={closeTop} peek="view"><button type="button">Nút trên</button></Modal>
      </>,
    );
    fireEvent.click(eye());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(closeTop).not.toHaveBeenCalled();
    expect(closeBelow).toHaveBeenCalledOnce();
  });

  it('shows a different decision at once: a new peek key brings a hidden dialog back', async () => {
    const { rerender } = render(<Decision extra={{ peekKey: 'op-1' }} />);
    fireEvent.click(eye());
    expect(restoreKey()).toBeTruthy();

    rerender(<Decision extra={{ peekKey: 'op-1' }} />);
    expect(restoreKey()).toBeTruthy();

    rerender(<Decision extra={{ peekKey: 'op-2' }} />);
    expect(restoreKey()).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Mua Cần Thơ?' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true));
  });

  it('shows the live status beside the restore key, and keeps it current while hidden', () => {
    const { rerender } = render(<Decision extra={{ peekSummary: <span>42 giây</span> }} />);
    fireEvent.click(eye());
    expect(screen.getByText('42 giây')).toBeTruthy();

    rerender(<Decision extra={{ peekSummary: <span>41 giây</span> }} />);
    expect(screen.queryByText('42 giây')).toBeNull();
    expect(screen.getByText('41 giây')).toBeTruthy();
  });

  it('survives a language change while hidden: the keys are named in the new language', async () => {
    const { SettingsProvider } = await import('../../../settings/SettingsProvider');
    const { I18nProvider } = await import('../../../i18n/I18n');
    const { DEFAULT_GAME_SETTINGS } = await import('../../../settings/defaults');
    const { useSettings } = await import('../../../settings/selectors');
    function Switch() {
      const { updateSettings } = useSettings();
      return <button type="button" onClick={() => updateSettings({ language: 'en' })}>chuyển</button>;
    }
    render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, language: 'vi' }}>
        <I18nProvider><Switch /><Decision /></I18nProvider>
      </SettingsProvider>,
    );
    fireEvent.click(eye());
    act(() => { fireEvent.click(screen.getByText('chuyển')); });

    expect(screen.getByRole('button', { name: 'Show Decision' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show Decision' }));
    expect(screen.getByRole('button', { name: 'View Board' })).toBeTruthy();
  });
});
