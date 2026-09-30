import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import Button from '../../../design-system/components/Button/Button';
import IconButton from '../../../design-system/components/IconButton/IconButton';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';

/** Concept-only turn banner: the loudest, shortest-lived element of the HUD (plan 03 builds it). */
export function TurnBannerConcept({
  name,
  characterId,
  colorId,
  mine = false,
}: { name: string; characterId: CharacterId | null; colorId: PlayerColorId; mine?: boolean }) {
  return (
    <div className="lab-banner" role="status">
      <PlayerAvatar size={56} characterId={characterId} colorId={colorId} active />
      <div className="lab-banner__text">
        <small>{mine ? 'Đến lượt bạn' : 'Đến lượt'}</small>
        <strong>{name}</strong>
      </div>
    </div>
  );
}

/** Concept-only action dock: one hero action, quiet secondary controls. */
export function ActionDockConcept({ compact = false, withRoll = true }: { compact?: boolean; withRoll?: boolean }) {
  return (
    <div className={`lab-dock${compact ? ' lab-dock--compact' : ''}`} role="toolbar" aria-label="Thanh hành động (concept)">
      <Button variant="ghost" size="md" icon={<ActionIcon name="view" />}>Tài sản của tôi (3)</Button>
      {withRoll ? <Button variant="primary" size="xl" icon={<ActionIcon name="roll" />}>Đổ xúc xắc</Button> : null}
      <IconButton label="Trò chuyện" icon="chat" badge={2} />
      <IconButton label="Cài đặt" icon="settings" />
    </div>
  );
}
