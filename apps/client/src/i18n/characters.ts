import type { CharacterId } from '@monopoly/shared';
import type { Language } from './I18n';
import { translate } from './I18n';

const CHARACTER_NAME_KEYS: Record<CharacterId, Parameters<typeof translate>[0]> = {
  dog: 'avatar.dog',
  capybara: 'avatar.capybara',
  panda: 'avatar.panda',
  cat: 'avatar.cat',
  penguin: 'avatar.penguin',
  elephant: 'avatar.elephant',
  rabbit: 'avatar.rabbit',
  duck: 'avatar.duck',
};

export function getCharacterName(characterId: CharacterId | null, language: Language): string {
  return characterId
    ? translate(CHARACTER_NAME_KEYS[characterId], language)
    : translate('avatar.legacy', language);
}
