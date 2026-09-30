import type { CharacterId } from '@monopoly/shared';
import dogSvg from './assets/dog.svg?raw';
import capybaraSvg from './assets/capybara.svg?raw';
import pandaSvg from './assets/panda.svg?raw';
import catSvg from './assets/cat.svg?raw';
import penguinSvg from './assets/penguin.svg?raw';
import elephantSvg from './assets/elephant.svg?raw';
import rabbitSvg from './assets/rabbit.svg?raw';
import duckSvg from './assets/duck.svg?raw';
import legacySvg from './assets/legacy.svg?raw';

export interface CharacterDefinition {
  id: CharacterId | null;
  displayName: string;
  /** Vietnamese label for assistive technology only (alt/aria-label); never shown as visible text. */
  accessibleLabel: string;
  svgSource: string;
  scale: number;
  verticalOffset: number;
  shadowScale: readonly [number, number];
}

const definition = (
  id: CharacterId,
  displayName: string,
  accessibleLabel: string,
  svgSource: string,
): CharacterDefinition => ({
  id,
  displayName,
  accessibleLabel,
  svgSource,
  scale: 1,
  verticalOffset: 0,
  shadowScale: [0.62, 0.38],
});

export const CHARACTER_REGISTRY: Record<CharacterId, CharacterDefinition> = {
  dog: definition('dog', 'Dog', 'Chó', dogSvg),
  capybara: definition('capybara', 'Capybara', 'Capybara', capybaraSvg),
  panda: definition('panda', 'Panda', 'Gấu trúc', pandaSvg),
  cat: definition('cat', 'Mèo', 'Mèo', catSvg),
  penguin: definition('penguin', 'Chim cánh cụt', 'Chim cánh cụt', penguinSvg),
  elephant: definition('elephant', 'Elephant', 'Voi', elephantSvg),
  rabbit: definition('rabbit', 'Thỏ', 'Thỏ', rabbitSvg),
  duck: definition('duck', 'Vịt', 'Vịt', duckSvg),
};

export const LEGACY_CHARACTER_DEFINITION: CharacterDefinition = {
  id: null,
  displayName: 'Mascot cũ',
  accessibleLabel: 'Mascot cũ',
  svgSource: legacySvg,
  scale: 0.92,
  verticalOffset: 0,
  shadowScale: [0.58, 0.35],
};

export function getCharacterDefinition(characterId: CharacterId | null): CharacterDefinition {
  return characterId ? CHARACTER_REGISTRY[characterId] : LEGACY_CHARACTER_DEFINITION;
}
