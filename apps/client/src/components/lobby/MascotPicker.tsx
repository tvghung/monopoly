import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  type PanInfo,
  type Variants,
} from 'framer-motion';
import { getAppearanceCombinationKey } from '@monopoly/shared';
import type {
  CharacterId,
  PlayerColorId,
  SetAppearanceRequest,
} from '@monopoly/shared';
import { CHARACTER_IDS, PLAYER_COLOR_IDS } from '@monopoly/shared';
import IconButton from '../../design-system/components/IconButton/IconButton';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { characterSvgDataUri } from '../../game/characters/characterSvg';
import { CHARACTER_REGISTRY } from '../../game/characters/characterRegistry';
import {
  getPlayerAccentDarkColor,
  getPlayerDisplayColor,
  PLAYER_COLOR_VISUALS,
} from '../../game/ui/playerVisualColors';
import { useEffectiveReducedMotion } from '../../settings/selectors';
import { useTranslation } from '../../i18n/I18n';
import { getCharacterName } from '../../i18n/characters';
import { getPlayerColorLabel } from '../../game/ui/playerVisualColors';
import MascotSparkles, { MASCOT_SPARKLE_LIFETIME_MS } from '../mascot/MascotSparkles';

interface MascotPickerProps {
  selectedCharacterId: CharacterId | null;
  playerColor: PlayerColorId;
  takenAppearanceKeys: ReadonlySet<string>;
  busy: boolean;
  onSetAppearance: (request: SetAppearanceRequest) => void;
  /** Solo shows the personal colour picker. In 2v2 the colour belongs to the team (chosen in the team zone), so there is none. */
  showColors?: boolean;
  /** 2v2: mascots a teammate already uses; they cannot be chosen because teammates share one colour. */
  lockedCharacterIds?: ReadonlySet<CharacterId>;
}

function wrapCharacterIndex(index: number): number {
  return (index + CHARACTER_IDS.length) % CHARACTER_IDS.length;
}

/** -1 when the viewed mascot came from the left (previous), 1 from the right (next), 0 for the first view. */
type BrowseDirection = -1 | 0 | 1;

/** A horizontal swipe on the viewed mascot this far, or this fast, moves to the neighbour. */
export const MASCOT_SWIPE_DISTANCE_PX = 48;
export const MASCOT_SWIPE_VELOCITY_PX_S = 420;

/** Which neighbour a finished swipe asks for: 1 next, -1 previous, 0 none (the mascot springs back). */
export function getSwipeDirection(info: Pick<PanInfo, 'offset' | 'velocity'>): BrowseDirection {
  if (info.offset.x <= -MASCOT_SWIPE_DISTANCE_PX || info.velocity.x <= -MASCOT_SWIPE_VELOCITY_PX_S) return 1;
  if (info.offset.x >= MASCOT_SWIPE_DISTANCE_PX || info.velocity.x >= MASCOT_SWIPE_VELOCITY_PX_S) return -1;
  return 0;
}

/** The viewed mascot slides in from the side it came from and leans into the move; the first view rises in place. */
const heroVariants: Variants = {
  enter: (direction: BrowseDirection) => ({
    opacity: 0, x: direction * 64, y: direction === 0 ? 10 : 0, rotate: direction * 10, scale: 0.86,
  }),
  center: {
    opacity: 1, x: 0, y: 0, rotate: 0, scale: 1,
  },
  exit: (direction: BrowseDirection) => ({
    opacity: 0, x: direction * -64, y: 0, rotate: direction * -10, scale: 0.86,
  }),
};

/** A cheer: crouch, jump, wiggle and land; played when the player taps the mascot or a new mascot or color is confirmed. */
const CHEER_ANIMATION = {
  y: [0, 6, -30, -24, 0, -5, 0],
  scaleX: [1, 1.12, 0.9, 1, 1.1, 0.98, 1],
  scaleY: [1, 0.86, 1.12, 1, 0.9, 1.03, 1],
  rotate: [0, 0, -8, 7, 0, -2, 0],
  transition: { duration: 0.72, ease: 'easeOut' as const },
};

export default function MascotPicker({
  selectedCharacterId,
  playerColor,
  takenAppearanceKeys,
  busy,
  onSetAppearance,
  showColors = true,
  lockedCharacterIds,
}: MascotPickerProps) {
  const { language, t } = useTranslation();
  const reducedMotion = useEffectiveReducedMotion();
  const firstCharacter = CHARACTER_IDS[0];
  const [focusedCharacterId, setFocusedCharacterId] = useState<CharacterId>(
    selectedCharacterId ?? firstCharacter,
  );
  const [direction, setDirection] = useState<BrowseDirection>(0);
  const [burst, setBurst] = useState<number | null>(null);
  const cheerControls = useAnimationControls();
  const previousAppearanceRef = useRef({ characterId: selectedCharacterId, color: playerColor });

  useEffect(() => {
    if (!busy) setFocusedCharacterId(selectedCharacterId ?? firstCharacter);
  }, [busy, firstCharacter, selectedCharacterId]);

  const cheer = (): void => {
    if (reducedMotion) return;
    void cheerControls.start(CHEER_ANIMATION);
    setBurst(current => (current ?? 0) + 1);
  };

  // A confirmed change of mascot or color (the server's answer, not the click) is celebrated once.
  useEffect(() => {
    const previous = previousAppearanceRef.current;
    previousAppearanceRef.current = { characterId: selectedCharacterId, color: playerColor };
    const changed = previous.characterId !== selectedCharacterId || previous.color !== playerColor;
    if (changed && selectedCharacterId !== null) cheer();
    // `cheer` only reads the latest reduced-motion flag; running again for it would celebrate a change twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerColor, selectedCharacterId]);

  useEffect(() => {
    if (burst === null) return undefined;
    const timer = window.setTimeout(() => setBurst(null), MASCOT_SPARKLE_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [burst]);

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
  const takenCharacterForColor = (color: PlayerColorId): CharacterId | null => (
    isCombinationTaken(focusedCharacterId, color) ? focusedCharacterId : null
  );


  const selectCharacter = (characterId: CharacterId, browse?: BrowseDirection): void => {
    if (busy) return;
    if (characterId !== focusedCharacterId) {
      const step = CHARACTER_IDS.indexOf(characterId) - focusedIndex;
      setDirection(browse ?? (Math.sign(step) as BrowseDirection));
    }
    setFocusedCharacterId(characterId);
    if (
      selectedCharacterId !== characterId
      && !lockedCharacterIds?.has(characterId)
      && !isCombinationTaken(characterId, playerColor)
    ) {
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
      selectCharacter(previousCharacterId, -1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectCharacter(nextCharacterId, 1);
    }
  };

  const handleSwipeEnd = (_event: unknown, info: PanInfo): void => {
    const swipe = getSwipeDirection(info);
    if (swipe === 1) selectCharacter(nextCharacterId, 1);
    else if (swipe === -1) selectCharacter(previousCharacterId, -1);
  };

  return (
    <section className="mascot-picker" style={accentStyle} aria-label={t('lobby.mascotPickerLabel')}>
      <div
        className="mascot-picker__stage"
        tabIndex={0}
        role="group"
        aria-label={t('lobby.mascotCurrent', { name: getCharacterName(focusedCharacterId, language) })}
        onKeyDown={handleKeyboardNavigation}
      >
        <IconButton
          className="mascot-picker__arrow"
          label={t('lobby.mascotPrevious')}
          icon="previous"
          disabled={busy}
          onClick={() => selectCharacter(previousCharacterId, -1)}
        />
        <button
          className="mascot-picker__side mascot-picker__side--previous"
          type="button"
          aria-label={t('lobby.selectMascot', { name: getCharacterName(previousCharacterId, language) })}
          disabled={busy}
          onClick={() => selectCharacter(previousCharacterId, -1)}
        >
          <img
            src={characterSvgDataUri(CHARACTER_REGISTRY[previousCharacterId].svgSource, playerColor)}
            alt=""
          />
        </button>

        <div className="mascot-picker__hero" aria-live="polite">
          <div className="mascot-picker__hero-art">
            <span className="mascot-picker__spotlight" aria-hidden="true" />
            <span className="mascot-picker__hero-shadow" aria-hidden="true" />
            <span className="mascot-picker__podium" aria-hidden="true" />
            {/* Swipe the mascot sideways to browse, tap it to make it cheer; the arrows and the keyboard do the same job. */}
            <motion.div
              className="mascot-picker__hero-grab"
              drag={busy || reducedMotion ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.45}
              dragSnapToOrigin
              onDragEnd={handleSwipeEnd}
              onTap={cheer}
            >
              <motion.div
                className="mascot-picker__hero-float"
                animate={{ y: reducedMotion ? 0 : [0, -4, 0] }}
                transition={reducedMotion
                  ? { duration: 0 }
                  : { duration: 3.4, ease: 'easeInOut', repeat: Infinity }}
              >
                <motion.div className="mascot-picker__hero-cheer" animate={cheerControls}>
                  <AnimatePresence mode="popLayout" custom={direction}>
                    <motion.img
                      key={focusedCharacterId}
                      className="mascot-picker__hero-image"
                      src={characterSvgDataUri(focusedCharacter.svgSource, playerColor)}
                      alt={getCharacterName(focusedCharacterId, language)}
                      draggable={false}
                      custom={direction}
                      variants={heroVariants}
                      initial={reducedMotion ? false : 'enter'}
                      animate="center"
                      exit={reducedMotion ? undefined : 'exit'}
                      transition={reducedMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 260, damping: 20 }}
                    />
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            </motion.div>
            {burst !== null ? <MascotSparkles key={burst} className="mascot-picker__sparkles" /> : null}
          </div>
        </div>

        <button
          className="mascot-picker__side mascot-picker__side--next"
          type="button"
          aria-label={t('lobby.selectMascot', { name: getCharacterName(nextCharacterId, language) })}
          disabled={busy}
          onClick={() => selectCharacter(nextCharacterId, 1)}
        >
          <img
            src={characterSvgDataUri(CHARACTER_REGISTRY[nextCharacterId].svgSource, playerColor)}
            alt=""
          />
        </button>
        <IconButton
          className="mascot-picker__arrow"
          label={t('lobby.mascotNext')}
          icon="next"
          disabled={busy}
          onClick={() => selectCharacter(nextCharacterId, 1)}
        />
      </div>

      <div className="mascot-picker__thumbnail-rail" role="group" aria-label={t('lobby.selectMascotGroup')}>
        {CHARACTER_IDS.map(characterId => {
          const character = CHARACTER_REGISTRY[characterId];
          const selected = selectedCharacterId === characterId;
          const focused = focusedCharacterId === characterId;
          const lockedByTeammate = !selected && Boolean(lockedCharacterIds?.has(characterId));
          return (
            <button
              key={characterId}
              className={`mascot-picker__thumbnail${selected ? ' mascot-picker__thumbnail--selected' : ''}${focused ? ' mascot-picker__thumbnail--focused' : ''}${lockedByTeammate ? ' mascot-picker__thumbnail--locked' : ''}`}
              type="button"
              aria-label={lockedByTeammate ? getCharacterName(characterId, language) + ' ' + t('lobby.mascotLocked') : getCharacterName(characterId, language)}
              aria-pressed={selected}
              disabled={busy || lockedByTeammate}
              onClick={() => selectCharacter(characterId)}
            >
              <img src={characterSvgDataUri(character.svgSource, playerColor)} alt="" />
            </button>
          );
        })}
      </div>

      {showColors ? (
      <div className="mascot-picker__colors" role="group" aria-label={t('lobby.playerColor')}>
        <div className="mascot-picker__color-grid">
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
                aria-label={takenCharacterId ? getPlayerColorLabel(color, language) + ' ' + t('lobby.colorUsedWith', { name: getCharacterName(takenCharacterId, language) }) : getPlayerColorLabel(color, language)}
                aria-pressed={selected}
                disabled={busy || unavailable}
                onClick={() => selectColor(color)}
              >
                <span
                  className="mascot-picker__color-swatch"
                  style={{ backgroundColor: visual.display, color: visual.foreground }}
                  aria-hidden="true"
                >
                  {selected
                    ? (
                      <motion.span
                        className="mascot-picker__color-check"
                        initial={reducedMotion ? false : { scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 18 }}
                      >
                        <ActionIcon name="ready" />
                      </motion.span>
                    )
                    : null}
                </span>
                <span>{getPlayerColorLabel(color, language)}</span>
              </button>
            );
          })}
        </div>
      </div>
      ) : null}
    </section>
  );
}
