import { PLAYER_COLOR_IDS, type PlayerColorId } from '@monopoly/shared';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { PLAYER_COLOR_VISUALS } from '../../game/ui/playerVisualColors';
import { useTranslation } from '../../i18n/I18n';
import { getPlayerColorLabel } from '../../game/ui/playerVisualColors';

interface TeamColorPickerProps {
  teamName: string;
  selected: PlayerColorId;
  /** The colour the other team wears; it cannot be taken. */
  otherTeamColor: PlayerColorId;
  /** Only members of this team may change its colour. */
  editable: boolean;
  busy: boolean;
  onSelect: (color: PlayerColorId) => void;
}

/**
 * The colour of one team. Everyone sees it; the members of the team can change it. A colour the other team already wears is
 * struck through and disabled (the server enforces the same rule), and a change resets the Ready of the whole team.
 */
export default function TeamColorPicker({
  teamName, selected, otherTeamColor, editable, busy, onSelect,
}: TeamColorPickerProps) {
  const { language, t } = useTranslation();
  if (!editable) {
    const visual = PLAYER_COLOR_VISUALS[selected];
    return (
      <p className="lobby-team__color-static">
        <span className="lobby-team__swatch" style={{ backgroundColor: visual.display }} aria-hidden="true" />
        <span>{t('lobby.teamColorStatic', { color: getPlayerColorLabel(selected, language) })}</span>
      </p>
    );
  }
  return (
    <div className="lobby-team__colors" role="group" aria-label={t('lobby.teamColorGroup', { teamName })}>
      <span className="lobby-team__colors-label">{t('lobby.teamColor')}</span>
      <div className="lobby-team__color-grid">
        {PLAYER_COLOR_IDS.map(color => {
          const visual = PLAYER_COLOR_VISUALS[color];
          const isSelected = color === selected;
          const takenByOther = color === otherTeamColor;
          return (
            <button
              key={color}
              type="button"
              className={`lobby-team__color${isSelected ? ' lobby-team__color--selected' : ''}`}
              aria-label={takenByOther ? t('lobby.teamColorTaken', { color: getPlayerColorLabel(color, language) }) : getPlayerColorLabel(color, language)}
              aria-pressed={isSelected}
              title={getPlayerColorLabel(color, language)}
              disabled={busy || takenByOther}
              onClick={() => { if (!isSelected) onSelect(color); }}
            >
              <span
                className="lobby-team__color-swatch"
                style={{ backgroundColor: visual.display, color: visual.foreground }}
                aria-hidden="true"
              >
                {isSelected ? <ActionIcon name="ready" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
