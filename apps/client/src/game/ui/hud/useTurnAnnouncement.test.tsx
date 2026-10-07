import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { turnAnnouncementText, useTurnAnnouncement } from './useTurnAnnouncement';

interface Props {
  active: string | null;
  name?: string;
  epoch?: number;
  language?: 'vi' | 'en';
}

function render(initial: Props) {
  return renderHook(
    ({ active, name, epoch = 0, language = 'vi' }: Props) => useTurnAnnouncement(active, name, 'player-a', epoch, language),
    { initialProps: initial },
  );
}

describe('turn announcement', () => {
  it('words the turn for the local player and for everybody else', () => {
    expect(turnAnnouncementText(true, 'An')).toBe('Đến lượt bạn.');
    expect(turnAnnouncementText(false, 'Bình')).toBe('Lượt của Bình.');
    expect(turnAnnouncementText(false, undefined)).toBe('');
  });

  it('announces the current turn in English', () => {
    expect(turnAnnouncementText(true, 'An', 'en')).toBe('It is your turn.');
    expect(turnAnnouncementText(false, 'An', 'en')).toBe('An’s turn.');
    const { result, rerender } = render({ active: 'player-a', name: 'An', language: 'en' });
    rerender({ active: 'player-b', name: 'Bình', language: 'en' });
    expect(result.current).toBe('Bình’s turn.');
    rerender({ active: 'player-b', name: 'Bình', language: 'vi' });
    expect(result.current).toBe('Lượt của Bình.');
  });

  it('says nothing on the first render', () => {
    const { result } = render({ active: 'player-a', name: 'An' });
    expect(result.current).toBe('');
  });

  it('announces a live turn change once and keeps the sentence until the next change', () => {
    const { result, rerender } = render({ active: 'player-a', name: 'An' });
    rerender({ active: 'player-b', name: 'Bình' });
    expect(result.current).toBe('Lượt của Bình.');
    rerender({ active: 'player-b', name: 'Bình' });
    expect(result.current).toBe('Lượt của Bình.');
    rerender({ active: 'player-a', name: 'An' });
    expect(result.current).toBe('Đến lượt bạn.');
  });

  it('does not announce a change that arrives with a new presentation reset epoch (a snapshot sync)', () => {
    const { result, rerender } = render({ active: 'player-a', name: 'An' });
    rerender({ active: 'player-b', name: 'Bình' });
    expect(result.current).toBe('Lượt của Bình.');
    rerender({ active: 'player-a', name: 'An', epoch: 1 });
    expect(result.current).toBe('');
  });

  it('does not announce the turn becoming known after it was unknown', () => {
    const { result, rerender } = render({ active: null });
    rerender({ active: 'player-b', name: 'Bình' });
    expect(result.current).toBe('');
  });
});
