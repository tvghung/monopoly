import { PLAYER_COLOR_IDS, type PlayerColorId } from '@monopoly/shared';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { PLAYER_COLOR_VISUALS } from '../../game/ui/playerVisualColors';

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
  if (!editable) {
    const visual = PLAYER_COLOR_VISUALS[selected];
    return (
      <p className="lobby-team__color-static">
        <span className="lobby-team__swatch" style={{ backgroundColor: visual.display }} aria-hidden="true" />
        <span>{`Màu đội: ${visual.label}`}</span>
      </p>
    );
  }
  return (
    <div className="lobby-team__colors" role="group" aria-label={`Màu của đội ${teamName}`}>
      <span className="lobby-team__colors-label">Màu đội</span>
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
              aria-label={`${visual.label}${takenByOther ? ' (đội kia đang dùng)' : ''}`}
              aria-pressed={isSelected}
              title={visual.label}
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
