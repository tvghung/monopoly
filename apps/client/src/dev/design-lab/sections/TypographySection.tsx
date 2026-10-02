import { useEffect, useState } from 'react';
import { LabBlock, LabSection, useLabFontsLoaded } from '../labKit';

export const VIETNAMESE_STRESS = 'Cờ Tỷ Phú Việt Nam · Buôn Ma Thuột · Đà Nẵng · Phú Quốc · Ỷ Ẫ Ự Ữ Ỹ ở ổ ỡ ợ';

const SCALE = [
  ['--type-caption', '12 / 16 · body 600', 'Huy hiệu, ghi chú nhỏ'],
  ['--type-small', '14 / 20 · body 500', 'Văn bản phụ, mô tả ngắn'],
  ['--type-body', '16 / 24 · body 500', 'Đoạn văn mặc định của giao diện'],
  ['--type-label', '16 / 20 · body 700', 'Nhãn nút và trường nhập'],
  ['--type-title-s', '20 / 26 · display 700', 'Tiêu đề bảng'],
  ['--type-title-m', '24 / 30 · display 700', 'Tiêu đề hộp thoại'],
  ['--type-title-l', '32 / 40 · display 800', 'Tiêu đề màn hình'],
  ['--type-display', '40 / 48 · display 800', 'Mã phòng · tên người thắng'],
  ['--type-money-l', '28 / 34 · display 800', '1.500.000 ₫'],
  ['--type-hero', '56 / 66 · display 800', 'Cờ Tỷ Phú'],
] as const;

const MONEY_SAMPLES = ['0 ₫', '1.111.111 ₫', '8.888.888 ₫', '12.345.678 ₫'] as const;

interface TnumProbe {
  balooProportionalDelta: number;
  balooTabularDelta: number;
  bodyTabularDelta: number;
}

function textWidth(font: string, numeric: 'normal' | 'tabular-nums', text: string): number {
  const probe = document.createElement('span');
  probe.textContent = text;
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${font};font-variant-numeric:${numeric}`;
  document.body.append(probe);
  const { width } = probe.getBoundingClientRect();
  probe.remove();
  return width;
}

function digitWidthDelta(font: string, numeric: 'normal' | 'tabular-nums'): number {
  return Math.abs(textWidth(font, numeric, '1111111') - textWidth(font, numeric, '0000000'));
}

/** Measures whether tabular numerals really change digit widths for each family (plan 01 §8.6). */
function useTnumProbe(enabled: boolean): TnumProbe | null {
  const [probe, setProbe] = useState<TnumProbe | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const display = '700 32px "Baloo 2"';
    setProbe({
      balooProportionalDelta: digitWidthDelta(display, 'normal'),
      balooTabularDelta: digitWidthDelta(display, 'tabular-nums'),
      bodyTabularDelta: digitWidthDelta('800 32px "Be Vietnam Pro"', 'tabular-nums'),
    });
  }, [enabled]);
  return probe;
}

export default function TypographySection() {
  const fontsLoaded = useLabFontsLoaded();
  const probe = useTnumProbe(fontsLoaded);
  const balooTnum = probe ? probe.balooTabularDelta < 0.5 : null;
  const bodyTnum = probe ? probe.bodyTabularDelta < 0.5 : null;

  return (
    <LabSection
      id="typography"
      title="2 · Typography"
      note="Baloo 2 (display) and Be Vietnam Pro (UI). Display line heights are at least 1.18 so stacked diacritics never clip."
    >
      <LabBlock caption="Families" wide>
        <div className="lab-families">
          <div className="lab-family lab-family--display">
            <small>--font-family-display · Baloo 2 700 / 800</small>
            <p>Cờ Tỷ Phú Việt Nam</p>
            <p className="lab-family__alpha">ABCĐEGHIKLMNOPQRSTUVXY abcđeghiklmnopqrstuvxy 0123456789</p>
          </div>
          <div className="lab-family lab-family--body">
            <small>--font-family-body · Be Vietnam Pro 500 / 600 / 700 / 800</small>
            <p>Cờ Tỷ Phú Việt Nam</p>
            <p className="lab-family__alpha">ABCĐEGHIKLMNOPQRSTUVXY abcđeghiklmnopqrstuvxy 0123456789</p>
          </div>
        </div>
      </LabBlock>

      <LabBlock caption="Type scale" wide>
        <div className="lab-scale">
          {SCALE.map(([token, spec, sample]) => (
            <div key={token} className="lab-scale__row">
              <div className="lab-scale__meta"><strong>{token}</strong><span>{spec}</span></div>
              <div className="lab-scale__sample" style={{ font: `var(${token})` }}>{sample}</div>
            </div>
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="Vietnamese stress string at every display size (line boxes outlined: nothing may clip)" wide>
        <div className="lab-stress-list" data-testid="vietnamese-stress">
          {(['--type-title-m', '--type-title-l', '--type-display', '--type-hero'] as const).map(token => (
            <div key={token} className="lab-stress" style={{ font: `var(${token})` }}>
              <span className="lab-stress__tag">{token}</span>
              {VIETNAMESE_STRESS}
            </div>
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="Money numerals: Baloo 2 vs Be Vietnam Pro, tabular vs proportional" wide>
        <div className="lab-money-grid">
          {([
            ['Baloo 2 800 · tabular-nums', 'var(--font-family-display)', 800, 'tabular-nums'],
            ['Baloo 2 800 · proportional', 'var(--font-family-display)', 800, 'normal'],
            ['Be Vietnam Pro 800 · tabular-nums', 'var(--font-family-body)', 800, 'tabular-nums'],
          ] as const).map(([caption, family, weight, numeric]) => (
            <div key={caption} className="lab-money-col">
              <small>{caption}</small>
              {MONEY_SAMPLES.map(sample => (
                <div
                  key={sample}
                  className="lab-money-cell"
                  style={{ fontFamily: family, fontWeight: weight, fontVariantNumeric: numeric }}
                >
                  {sample}
                </div>
              ))}
            </div>
          ))}
        </div>
        <p
          className="lab-tnum-verdict"
          data-testid="tnum-verdict"
          data-baloo-tnum={balooTnum === null ? 'pending' : String(balooTnum)}
          data-body-tnum={bodyTnum === null ? 'pending' : String(bodyTnum)}
        >
          {probe
            ? `Width difference between 1111111 and 0000000 at 32px — Baloo 2 proportional ${probe.balooProportionalDelta.toFixed(2)}px, Baloo 2 tabular ${probe.balooTabularDelta.toFixed(2)}px, Be Vietnam Pro tabular ${probe.bodyTabularDelta.toFixed(2)}px → Baloo 2 tnum ${balooTnum ? 'SUPPORTED' : 'MISSING'}, Be Vietnam Pro tnum ${bodyTnum ? 'SUPPORTED' : 'MISSING'}. Money therefore uses ${balooTnum ? 'Baloo 2' : bodyTnum ? 'Be Vietnam Pro 800' : 'a fixed-width wrapper'}.`
            : 'Measuring…'}
        </p>
      </LabBlock>
    </LabSection>
  );
}
