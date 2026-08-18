import type { CharacterId } from '@monopoly/shared';
import shibaSvg from './assets/shiba.svg?raw';
import capybaraSvg from './assets/capybara.svg?raw';
import pandaSvg from './assets/panda.svg?raw';
import catSvg from './assets/cat.svg?raw';
import penguinSvg from './assets/penguin.svg?raw';
import foxSvg from './assets/fox.svg?raw';
import rabbitSvg from './assets/rabbit.svg?raw';
import duckSvg from './assets/duck.svg?raw';
import legacySvg from './assets/legacy.svg?raw';

export interface CharacterDefinition {
  id: CharacterId | null;
  displayName: string;
  svgSource: string;
  scale: number;
  verticalOffset: number;
  shadowScale: readonly [number, number];
}

const definition = (
  id: CharacterId,
  displayName: string,
  svgSource: string,
): CharacterDefinition => ({
  id,
  displayName,
  svgSource,
  scale: 1,
  verticalOffset: 0,
  shadowScale: [0.62, 0.38],
});

export const CHARACTER_REGISTRY: Record<CharacterId, CharacterDefinition> = {
  shiba: definition('shiba', 'Shiba', shibaSvg),
  capybara: definition('capybara', 'Capybara', capybaraSvg),
  panda: definition('panda', 'Panda', pandaSvg),
  cat: definition('cat', 'Mèo', catSvg),
  penguin: definition('penguin', 'Chim cánh cụt', penguinSvg),
  fox: definition('fox', 'Cáo', foxSvg),
  rabbit: definition('rabbit', 'Thỏ', rabbitSvg),
  duck: definition('duck', 'Vịt', duckSvg),
};

export const LEGACY_CHARACTER_DEFINITION: CharacterDefinition = {
  id: null,
  displayName: 'Mascot cũ',
  svgSource: legacySvg,
  scale: 0.92,
  verticalOffset: 0,
  shadowScale: [0.58, 0.35],
};

export function getCharacterDefinition(characterId: CharacterId | null): CharacterDefinition {
  return characterId ? CHARACTER_REGISTRY[characterId] : LEGACY_CHARACTER_DEFINITION;
}
