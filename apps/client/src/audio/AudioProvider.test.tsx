import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../settings/SettingsProvider';
import { DEFAULT_GAME_SETTINGS } from '../settings/defaults';
import {
  AudioProvider,
  handleAudioButtonClick,
} from './AudioProvider';
import type { AudioPort } from './types';

function trustedClick(target: EventTarget): MouseEvent {
  return { isTrusted: true, target } as MouseEvent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('central UI audio', () => {
  it('plays for enabled button activation, including a nested keyboard click target', () => {
    const audio: AudioPort = {
      play: vi.fn(),
      handleUserInteraction: vi.fn(),
    };
    const button = document.createElement('button');
    const label = document.createElement('span');
    button.append(label);

    handleAudioButtonClick(trustedClick(label), audio);

    expect(audio.handleUserInteraction).toHaveBeenCalledWith('ui.click');
  });

  it('ignores untrusted, disabled, aria-disabled, and opted-out button clicks', () => {
    const audio: AudioPort = {
      play: vi.fn(),
      handleUserInteraction: vi.fn(),
    };
    const button = document.createElement('button');

    handleAudioButtonClick({ isTrusted: false, target: button } as unknown as MouseEvent, audio);
    button.disabled = true;
    handleAudioButtonClick(trustedClick(button), audio);
    button.disabled = false;
    button.setAttribute('aria-disabled', 'true');
    handleAudioButtonClick(trustedClick(button), audio);
    button.removeAttribute('aria-disabled');
    button.dataset.audioClick = 'off';
    handleAudioButtonClick(trustedClick(button), audio);

    expect(audio.handleUserInteraction).not.toHaveBeenCalled();
  });

  it('keeps exactly one active document listener set under StrictMode', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const view = render(
      <StrictMode>
        <SettingsProvider initialSettings={DEFAULT_GAME_SETTINGS}>
          <AudioProvider><button type="button">Thử</button></AudioProvider>
        </SettingsProvider>
      </StrictMode>,
    );

    for (const eventType of ['pointerdown', 'keydown', 'click']) {
      const adds = add.mock.calls.filter(call => call[0] === eventType).length;
      const removes = remove.mock.calls.filter(call => call[0] === eventType).length;
      expect(adds - removes).toBe(1);
    }

    view.unmount();
    for (const eventType of ['pointerdown', 'keydown', 'click']) {
      const adds = add.mock.calls.filter(call => call[0] === eventType).length;
      const removes = remove.mock.calls.filter(call => call[0] === eventType).length;
      expect(adds - removes).toBe(0);
    }
  });
});
