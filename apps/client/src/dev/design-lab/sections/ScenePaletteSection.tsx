import { OTB_PALETTE } from '../../../design-system/tokens/palette';
import { PLAYER_COLOR_VISUALS } from '../../../game/ui/playerVisualColors';
import { getPropertyGroupVisualStyle } from '../../../game/ui/propertyVisualColors';
import { LabBlock, LabSection } from '../labKit';

const DISTRICTS = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue', 'railroad'] as const;

/** Input for plan 02: the light oak table next to the district and player colors that sit on it. */
export default function ScenePaletteSection() {
  return (
    <LabSection
      id="scene-palette"
      title="5 · Scene palette"
      note="Light oak table only, no felt mat (OD-01-2). Values come from OTB_PALETTE, the single source shared with the WebGL scene."
    >
      <LabBlock caption="Table, grain and backdrop" wide>
        <div className="lab-scene-swatches">
          {(['table-oak', 'table-oak-dark', 'backdrop', 'paper-50'] as const).map(key => (
            <div key={key} className="lab-scene-swatch" style={{ background: OTB_PALETTE[key] }}>
              <strong>--otb-{key}</strong>
              <span>{OTB_PALETTE[key]}</span>
            </div>
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="Mock tabletop: districts and player colors on the oak table" wide>
        <div className="lab-table-mock">
          <div className="lab-table-mock__board">
            {DISTRICTS.map(group => (
              <span
                key={group}
                className="lab-table-mock__tile"
                style={{ background: getPropertyGroupVisualStyle(group).color }}
                title={group}
              />
            ))}
          </div>
          <div className="lab-table-mock__pieces">
            {Object.values(PLAYER_COLOR_VISUALS).map(visual => (
              <span key={visual.display} className="lab-table-mock__piece" style={{ background: visual.display }} />
            ))}
          </div>
          <div className="lab-table-mock__panel">
            Panel giấy (paper-50) trên bàn gỗ sáng chỉ tách nền 1,76:1: luôn cần viền mảnh và elevation-2.
          </div>
        </div>
      </LabBlock>
    </LabSection>
  );
}
