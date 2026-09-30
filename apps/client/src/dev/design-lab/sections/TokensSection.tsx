import { CSS_SEMANTIC_TOKENS, PALETTE_ROLES } from '../tokenCatalog';
import { contrastRatio } from '../../../design-system/tokens/contrast';
import {
  CONTRAST_MINIMUM,
  CONTRAST_REQUIREMENTS,
  OTB_PALETTE,
  type OtbPaletteKey,
} from '../../../design-system/tokens/palette';
import { PLAYER_COLOR_VISUALS } from '../../../game/ui/playerVisualColors';
import { getPropertyGroupVisualStyle } from '../../../game/ui/propertyVisualColors';
import { LabBlock, LabSection } from '../labKit';

const DISTRICTS = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue', 'railroad', 'utility'] as const;
const INK = OTB_PALETTE['ink-900'];

function readableOn(hex: string): string {
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, INK) ? '#FFFFFF' : INK;
}

function computedTokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function TokensSection() {
  const paletteKeys = Object.keys(OTB_PALETTE) as OtbPaletteKey[];
  return (
    <LabSection
      id="tokens"
      title="1 · Tokens"
      note="Primitive palette (--otb-*), semantic layer, contrast matrix, shape, depth and motion."
    >
      <LabBlock caption="Primitive palette" wide>
        <div className="lab-swatches">
          {paletteKeys.map(key => {
            const value = OTB_PALETTE[key];
            const isHex = value.startsWith('#');
            return (
              <div key={key} className="lab-swatch">
                <div
                  className="lab-swatch__chip"
                  style={{ background: value, color: isHex ? readableOn(value) : INK }}
                >
                  Aa
                </div>
                <div className="lab-swatch__meta">
                  <strong>--otb-{key}</strong>
                  <span>{value}</span>
                  <span>{PALETTE_ROLES[key]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </LabBlock>

      <LabBlock caption="Semantic tokens (resolved for the active theme)" wide>
        <div className="lab-swatches lab-swatches--compact">
          {CSS_SEMANTIC_TOKENS.map(name => (
            <div key={name} className="lab-swatch lab-swatch--row">
              <div className="lab-swatch__chip lab-swatch__chip--small" style={{ background: `var(${name})` }} />
              <div className="lab-swatch__meta">
                <strong>{name}</strong>
                <span>{computedTokenValue(name)}</span>
              </div>
            </div>
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="Contrast matrix (live, from contrastRatio)" wide>
        <table className="lab-table">
          <thead>
            <tr><th>Sample</th><th>Foreground</th><th>Background</th><th>Ratio</th><th>Needs</th><th>Result</th></tr>
          </thead>
          <tbody>
            {CONTRAST_REQUIREMENTS.map(({ foreground, background, use }) => {
              const ratio = contrastRatio(OTB_PALETTE[foreground], OTB_PALETTE[background]);
              const pass = ratio >= CONTRAST_MINIMUM[use];
              return (
                <tr key={`${foreground}-${background}`}>
                  <td>
                    <span
                      className="lab-contrast-sample"
                      style={{ color: OTB_PALETTE[foreground], background: OTB_PALETTE[background] }}
                    >
                      Aa Đà Nẵng
                    </span>
                  </td>
                  <td>{foreground}</td>
                  <td>{background}</td>
                  <td>{ratio.toFixed(2)}</td>
                  <td>{use}</td>
                  <td className={pass ? 'lab-pass' : 'lab-fail'}>{pass ? 'PASS' : 'FAIL'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </LabBlock>

      <LabBlock caption="District colors (DOM) with header text" wide>
        <div className="lab-districts">
          {DISTRICTS.map(group => {
            const style = getPropertyGroupVisualStyle(group);
            return (
              <div key={group} className="lab-district" style={{ background: style.tint }}>
                <div className="lab-district__header" style={{ background: style.color, color: style.headerText }}>
                  {style.label}
                </div>
                <span className="lab-district__meta">{style.color} · text {style.headerText}</span>
              </div>
            );
          })}
        </div>
      </LabBlock>

      <LabBlock caption="Player colors (used only on player-owned elements)" wide>
        <div className="lab-swatches lab-swatches--compact">
          {Object.entries(PLAYER_COLOR_VISUALS).map(([id, visual]) => (
            <div key={id} className="lab-swatch lab-swatch--row">
              <div className="lab-swatch__chip lab-swatch__chip--small" style={{ background: visual.display }} />
              <div className="lab-swatch__meta">
                <strong>{id}</strong>
                <span>{visual.display} · {visual.label}</span>
              </div>
            </div>
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="Shape, depth and focus" wide>
        <div className="lab-shapes">
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map(size => (
            <div key={size} className="lab-shape" style={{ borderRadius: `var(--radius-${size})` }}>radius-{size}</div>
          ))}
          {([1, 2, 3] as const).map(level => (
            <div key={level} className="lab-shape lab-shape--raised" style={{ boxShadow: `var(--elevation-${level})` }}>
              elevation-{level}
            </div>
          ))}
          <div className="lab-shape lab-shape--raised" style={{ boxShadow: 'var(--focus-ring)' }}>focus-ring</div>
        </div>
      </LabBlock>

      <LabBlock caption="Motion tokens" wide>
        <table className="lab-table">
          <thead><tr><th>Token</th><th>Value</th><th>Use</th></tr></thead>
          <tbody>
            {[
              ['--motion-duration-micro', 'hover, press'],
              ['--motion-duration-ui', 'toggles, chips'],
              ['--motion-duration-panel', 'drawers, sheets, modals'],
              ['--motion-duration-emphasis', 'turn banner, money counter'],
              ['--motion-duration-celebration', 'victory, landmark completion (max 1200ms)'],
              ['--motion-ease-out', 'enter'],
              ['--motion-ease-in-out', 'move'],
            ].map(([name, use]) => (
              <tr key={name}><td>{name}</td><td>{computedTokenValue(name)}</td><td>{use}</td></tr>
            ))}
          </tbody>
        </table>
      </LabBlock>
    </LabSection>
  );
}
