import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmationDialog from './ConfirmationDialog';

afterEach(cleanup);

function renderDialog(props: Partial<Parameters<typeof ConfirmationDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmationDialog
      open
      title="Mời Bình ra khỏi phòng?"
      message="Bình sẽ rời khỏi phòng này."
      confirmLabel="Mời ra"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmationDialog', () => {
  it('is a danger alertdialog described by its message, with Cancel first and focused', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog', { name: 'Mời Bình ra khỏi phòng?' });
    expect(dialog.className).toContain('ds-modal--danger');
    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Bình sẽ rời khỏi phòng này.');
    expect(screen.getByRole('button', { name: 'Mời ra' }).className).toContain('ds-button--danger');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hủy' }));
  });

  it('calls the right handler for each answer, and Escape cancels', () => {
    const { onConfirm, onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Mời ra' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('can be a neutral question: default tone, primary confirm, its own icon and labels', () => {
    renderDialog({
      tone: 'neutral', icon: 'swap', confirmLabel: 'Đồng ý', cancelLabel: 'Từ chối', title: 'Bình muốn đổi chỗ với bạn',
    });

    const dialog = screen.getByRole('alertdialog', { name: 'Bình muốn đổi chỗ với bạn' });
    expect(dialog.className).not.toContain('ds-modal--danger');
    expect(screen.getByRole('button', { name: 'Đồng ý' }).className).toContain('ds-button--primary');
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeTruthy();
    expect(dialog.querySelector('.ds-confirmation__icon--neutral')).not.toBeNull();
  });

  it('turns both answers off while an answer is on its way, and keeps focus inside the dialog', () => {
    const { onCancel } = renderDialog({ busy: true });

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Mời ra' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Hủy' }).disabled).toBe(true);
    // Nothing to focus: the dialog card itself takes focus, so the page behind never keeps it.
    expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
    // Escape and a header close key would be a second answer: neither exists while busy.
    expect(screen.queryByRole('button', { name: 'Đóng' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
