import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { getAppearanceCombinationKey } from '@monopoly/shared';
import type {
  CharacterId,
  PlayerColorId,
  SetAppearanceRequest,
} from '@monopoly/shared';
import { CHARACTER_IDS, PLAYER_COLOR_IDS } from '@monopoly/shared';
import { characterSvgDataUri } from '../../game/characters/characterSvg';
import { CHARACTER_REGISTRY } from '../../game/characters/characterRegistry';
import {
  getPlayerAccentDarkColor,
  getPlayerDisplayColor,
  PLAYER_COLOR_VISUALS,
} from '../../game/ui/playerVisualColors';

interface MascotPickerProps {
  selectedCharacterId: CharacterId | null;
  playerColor: PlayerColorId;
  takenAppearanceKeys: ReadonlySet<string>;
  busy: boolean;
  onSetAppearance: (request: SetAppearanceRequest) => void;
}

function wrapCharacterIndex(index: number): number {
  return (index + CHARACTER_IDS.length) % CHARACTER_IDS.length;
}

export default function MascotPicker({
  selectedCharacterId,
  playerColor,
  takenAppearanceKeys,
  busy,
  onSetAppearance,
}: MascotPickerProps) {
  const reducedMotion = useReducedMotion();
  const firstCharacter = CHARACTER_IDS[0];
  const [focusedCharacterId, setFocusedCharacterId] = useState<CharacterId>(
    selectedCharacterId ?? firstCharacter,
  );

  useEffect(() => {
    if (!busy) setFocusedCharacterId(selectedCharacterId ?? firstCharacter);
  }, [busy, firstCharacter, selectedCharacterId]);

  const focusedIndex = CHARACTER_IDS.indexOf(focusedCharacterId);
  const previousCharacterId = CHARACTER_IDS[wrapCharacterIndex(focusedIndex - 1)];
  const nextCharacterId = CHARACTER_IDS[wrapCharacterIndex(focusedIndex + 1)];
  const focusedCharacter = CHARACTER_REGISTRY[focusedCharacterId];
  const displayColor = getPlayerDisplayColor(playerColor);
  const accentStyle = {
    '--mascot-accent': displayColor,
    '--mascot-accent-dark': getPlayerAccentDarkColor(playerColor),
  } as CSSProperties;
  const isCombinationTaken = (characterId: CharacterId, color: PlayerColorId): boolean => {
    const key = getAppearanceCombinationKey(characterId, color);
    return key !== null && takenAppearanceKeys.has(key);
  };
  const focusedPairTaken = isCombinationTaken(focusedCharacterId, playerColor);
  const takenCharacterForColor = (color: PlayerColorId): CharacterId | null => (
    isCombinationTaken(focusedCharacterId, color) ? focusedCharacterId : null
  );
  const selectionStatus = busy
    ? 'Đang lưu lựa chọn...'
    : focusedPairTaken
      ? 'Chọn màu khác'
      : selectedCharacterId === focusedCharacterId
        ? 'Đã chọn'
        : 'Chọn màu để xác nhận';

  const selectCharacter = (characterId: CharacterId): void => {
    if (busy) return;
    setFocusedCharacterId(characterId);
    if (selectedCharacterId !== characterId && !isCombinationTaken(characterId, playerColor)) {
      onSetAppearance({ characterId });
    }
  };

  const selectColor = (color: PlayerColorId): void => {
    if (busy || isCombinationTaken(focusedCharacterId, color)) return;
    if (focusedCharacterId === selectedCharacterId) {
      onSetAppearance({ color });
    } else {
      onSetAppearance({ characterId: focusedCharacterId, color });
    }
  };

  const handleKeyboardNavigation = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectCharacter(previousCharacterId);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectCharacter(nextCharacterId);
    }
  };

  return (
    <section className="mascot-picker" style={accentStyle} aria-labelledby="appearance-title">
      <div
        className="mascot-picker__stage"
        tabIndex={0}
        role="group"
        aria-label={`Mascot đang xem: ${focusedCharacter.displayName}. Dùng phím mũi tên trái phải để đổi.`}
        onKeyDown={handleKeyboardNavigation}
      >
        <button
          className="mascot-picker__arrow"
          type="button"
          aria-label="Mascot trước"
          disabled={busy}
          onClick={() => selectCharacter(previousCharacterId)}
        >
          ←
        </button>
        <button
          className="mascot-picker__side mascot-picker__side--previous"
          type="button"
          aria-label={`Chọn mascot ${CHARACTER_REGISTRY[previousCharacterId].displayName}`}
          disabled={busy}
          onClick={() => selectCharacter(previousCharacterId)}
        >
          <img
            src={characterSvgDataUri(CHARACTER_REGISTRY[previousCharacterId].svgSource, playerColor)}
            alt=""
          />
          <span>{CHARACTER_REGISTRY[previousCharacterId].displayName}</span>
        </button>

        <div className="mascot-picker__hero" aria-live="polite">
          <div className="mascot-picker__hero-art">
            <span className="mascot-picker__hero-shadow" aria-hidden="true" />
            <span className="mascot-picker__podium" aria-hidden="true" />
            <motion.div
              className="mascot-picker__hero-float"
              animate={{ y: reducedMotion ? 0 : [0, -4, 0] }}
              transition={reducedMotion
                ? { duration: 0 }
                : { duration: 3.4, ease: 'easeInOut', repeat: Infinity }}
            >
              <motion.img
                key={focusedCharacterId}
                className="mascot-picker__hero-image"
                src={characterSvgDataUri(focusedCharacter.svgSource, playerColor)}
                alt={focusedCharacter.displayName}
                initial={reducedMotion ? false : { opacity: 0, scale: 0.86, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={reducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 240, damping: 18 }}
              />
            </motion.div>
          </div>
          <strong>{focusedCharacter.displayName}</strong>
        </div>

        <button
          className="mascot-picker__side mascot-picker__side--next"
          type="button"
          aria-label={`Chọn mascot ${CHARACTER_REGISTRY[nextCharacterId].displayName}`}
          disabled={busy}
          onClick={() => selectCharacter(nextCharacterId)}
        >
          <img
            src={characterSvgDataUri(CHARACTER_REGISTRY[nextCharacterId].svgSource, playerColor)}
            alt=""
          />
          <span>{CHARACTER_REGISTRY[nextCharacterId].displayName}</span>
        </button>
        <button
          className="mascot-picker__arrow"
          type="button"
          aria-label="Mascot tiếp theo"
          disabled={busy}
          onClick={() => selectCharacter(nextCharacterId)}
        >
          →
        </button>
      </div>

      <div className="mascot-picker__rail-heading">
        <span>Tất cả mascot</span>
      </div>
      <div className="mascot-picker__thumbnail-rail" role="group" aria-label="Chọn mascot">
        {CHARACTER_IDS.map(characterId => {
          const character = CHARACTER_REGISTRY[characterId];
          const selected = selectedCharacterId === characterId;
          const focused = focusedCharacterId === characterId;
          return (
            <button
              key={characterId}
              className={`mascot-picker__thumbnail${selected ? ' mascot-picker__thumbnail--selected' : ''}${focused ? ' mascot-picker__thumbnail--focused' : ''}`}
              type="button"
              aria-label={character.displayName}
              aria-pressed={selected}
              disabled={busy}
              onClick={() => selectCharacter(characterId)}
            >
              <img src={characterSvgDataUri(character.svgSource, playerColor)} alt="" />
              <span>{character.displayName}</span>
            </button>
          );
        })}
      </div>

      <fieldset className="mascot-picker__colors">
        <div className="mascot-picker__color-grid" role="group" aria-label="Chọn màu người chơi">
          {PLAYER_COLOR_IDS.map(color => {
            const visual = PLAYER_COLOR_VISUALS[color];
            const selected = playerColor === color;
            const takenCharacterId = takenCharacterForColor(color);
            const unavailable = takenCharacterId !== null;
            return (
              <button
                key={color}
                className={`mascot-picker__color${selected ? ' mascot-picker__color--selected' : ''}`}
                type="button"
                aria-label={`${visual.label}${takenCharacterId ? ` (đã dùng với ${CHARACTER_REGISTRY[takenCharacterId].displayName})` : ''}`}
                aria-pressed={selected}
                disabled={busy || unavailable}
                onClick={() => selectColor(color)}
              >
                <span
                  className="mascot-picker__color-swatch"
                  style={{ backgroundColor: visual.display }}
                  aria-hidden="true"
                />
                <span>{visual.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
