import { useMemo, type CSSProperties } from 'react';
import { Ban, LogOut, WifiOff } from 'lucide-react';
import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import { getCharacterDefinition } from '../../../game/characters/characterRegistry';
import { characterSvgDataUri } from '../../../game/characters/characterSvg';
import { getPlayerDisplayColor } from '../../../game/ui/playerVisualColors';
import { useTranslation } from '../../../i18n/I18n';
import { getCharacterName } from '../../../i18n/characters';
import './PlayerAvatar.css';

export type PlayerAvatarStatus = 'online' | 'offline' | 'bankrupt' | 'left';

export interface PlayerAvatarProps {
  characterId: CharacterId | null;
  colorId: PlayerColorId;
  /** Pixel size; the presets used by the HUD and pre-game screens are 32, 36, 44, 48, 56, 64 and 128. */
  size?: number;
  /** Gold turn ring around the avatar. */
  active?: boolean;
  status?: PlayerAvatarStatus;
  className?: string;
}

function ringWidth(size: number): number {
  if (size <= 36) return 2;
  return size <= 64 ? 3 : 4;
}

/**
 * Mascot with a player-color ring. The mascot name is never visible text: `alt` carries the
 * Vietnamese accessible label, and non-online statuses add a labelled marker.
 */
export default function PlayerAvatar({
  characterId,
  colorId,
  size = 48,
  active = false,
  status = 'online',
  className = '',
}: PlayerAvatarProps) {
  const { language, t } = useTranslation();
  const definition = getCharacterDefinition(characterId);
  const mascotName = getCharacterName(characterId, language);
  const source = useMemo(
    () => characterSvgDataUri(definition.svgSource, colorId),
    [colorId, definition.svgSource],
  );
  const marker = status === 'online' ? null : {
    offline: { label: t('status.disconnected'), Icon: WifiOff },
    bankrupt: { label: t('status.bankrupt'), Icon: Ban },
    left: { label: t('status.left'), Icon: LogOut },
  }[status];
  const style = {
    '--ds-avatar-size': `${size}px`,
    '--ds-avatar-ring': `${ringWidth(size)}px`,
    '--ds-avatar-color': getPlayerDisplayColor(colorId),
  } as CSSProperties;
  const modifiers = [
    active ? 'ds-avatar--active' : '',
    status === 'bankrupt' || status === 'left' ? 'ds-avatar--inactive' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={`ds-avatar${modifiers ? ` ${modifiers}` : ''}`} style={style} data-status={status}>
      <img
        className="ds-avatar__image"
        src={source}
        alt={t('avatar.mascot', { name: mascotName })}
        width={size}
        height={size}
        draggable={false}
      />
      {marker ? (
        <span className={`ds-avatar__status ds-avatar__status--${status}`} role="img" aria-label={marker.label}>
          <marker.Icon aria-hidden="true" focusable="false" />
        </span>
      ) : null}
    </span>
  );
}
