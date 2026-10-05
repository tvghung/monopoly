import type { ReactNode } from 'react';
import { Monitor } from 'lucide-react';
import Button from '../design-system/components/Button/Button';
import Modal from '../design-system/components/Modal/Modal';
import SegmentedControl, { type SegmentedControlProps } from '../design-system/components/SegmentedControl/SegmentedControl';
import Slider from '../design-system/components/Slider/Slider';
import Switch from '../design-system/components/Switch/Switch';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import UpdateSettingsContent from '../components/update/UpdateSettingsContent';
import { useAppUpdate } from '../runtime/appUpdate';
import { getDesktopBridge, isDesktopRuntime } from '../runtime/desktopBridge';
import { ANIMATION_SPEED_OPTIONS } from './defaults';
import type { GraphicsQualitySetting } from './types';
import { useEffectiveReducedMotion, useSettings } from './selectors';
import './SettingsPanel.css';

const VOLUME_CONTROLS: readonly { key: 'masterVolume' | 'musicVolume' | 'sfxVolume'; label: string }[] = [
  { key: 'masterVolume', label: 'Âm lượng tổng' },
  { key: 'musicVolume', label: 'Nhạc nền' },
  { key: 'sfxVolume', label: 'Hiệu ứng' },
];

const SPEED_CHOICES = ANIMATION_SPEED_OPTIONS.map(option => ({ value: option, label: `${option}x` }));

const GRAPHICS_QUALITY_CHOICES: readonly { value: GraphicsQualitySetting; label: string }[] = [
  { value: 'auto', label: 'Tự động' },
  { value: 'high', label: 'Cao' },
  { value: 'balanced', label: 'Cân bằng' },
  { value: 'low', label: 'Thấp' },
];

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

function SectionHeading({ id, icon, children }: { id: string; icon: ReactNode; children: string }) {
  return (
    <h3 id={id} className="settings-panel__heading">
      <span className="settings-panel__heading-icon" aria-hidden="true">{icon}</span>
      {children}
    </h3>
  );
}

/** A segmented choice with a visible label; the group itself carries the same text as its accessible name. */
function SegmentedField<T extends string | number>({
  label,
  hint,
  ...control
}: Omit<SegmentedControlProps<T>, 'className'> & { hint?: string }) {
  return (
    <div className="settings-panel__field">
      <span className="settings-panel__label" aria-hidden="true">{label}</span>
      <SegmentedControl label={label} className="settings-panel__segmented" {...control} />
      {hint ? <p className="settings-panel__hint">{hint}</p> : null}
    </div>
  );
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { settings, updateSettings, resetSettings } = useSettings();
  const effectiveReducedMotion = useEffectiveReducedMotion();
  const desktop = isDesktopRuntime();
  const bridge = getDesktopBridge();
  const updates = useAppUpdate();

  const setFullscreen = (value: boolean) => {
    updateSettings({ fullscreen: value });
    if (bridge) void bridge.window.setFullscreen(value);
  };

  return (
    <Modal
      open={open}
      title="Cài đặt"
      size="md"
      onClose={onClose}
      className="settings-panel-modal"
      footer={(
        <>
          <Button
            variant="ghost"
            className="settings-panel__reset"
            icon={<ActionIcon name="reset" />}
            onClick={resetSettings}
          >
            Khôi phục mặc định
          </Button>
          <Button icon={<ActionIcon name="confirm" />} onClick={onClose}>Xong</Button>
        </>
      )}
    >
      <div className="settings-panel">
        <section className="settings-panel__section" aria-labelledby="settings-audio-title">
          <SectionHeading id="settings-audio-title" icon={<ActionIcon name="volume" />}>Âm thanh</SectionHeading>
          {VOLUME_CONTROLS.map(({ key, label }) => (
            <Slider
              key={key}
              label={label}
              value={settings[key]}
              min={0}
              max={1}
              step={0.05}
              className="settings-panel__slider"
              formatValue={formatPercent}
              onChange={value => updateSettings({ [key]: value })}
            />
          ))}
        </section>

        <section className="settings-panel__section" aria-labelledby="settings-motion-title">
          <SectionHeading id="settings-motion-title" icon={<ActionIcon name="speed" />}>Hiển thị</SectionHeading>
          <SegmentedField
            label="Tốc độ chuyển động"
            options={SPEED_CHOICES}
            value={settings.animationSpeed}
            onChange={value => updateSettings({ animationSpeed: value })}
          />
          <div className="settings-panel__field">
            <Switch
              label="Giảm chuyển động"
              checked={settings.reducedMotion}
              describedBy="settings-motion-hint"
              onChange={checked => updateSettings({ reducedMotion: checked })}
            />
            <p id="settings-motion-hint" className="settings-panel__hint" aria-live="polite">
              {effectiveReducedMotion
                ? 'Chuyển động hiện đang được giảm theo cài đặt hoặc hệ điều hành.'
                : 'Chuyển động đang dùng thiết lập bình thường.'}
            </p>
          </div>
        </section>

        <section className="settings-panel__section" aria-labelledby="settings-graphics-title">
          <SectionHeading id="settings-graphics-title" icon={<Monitor />}>Đồ họa</SectionHeading>
          <SegmentedField
            label="Chất lượng đồ họa"
            options={GRAPHICS_QUALITY_CHOICES}
            value={settings.graphicsQuality}
            onChange={value => updateSettings({ graphicsQuality: value })}
            hint="Chất lượng Cao cần card đồ họa mạnh."
          />
        </section>

        {desktop
          ? (
            <section className="settings-panel__section" aria-labelledby="settings-window-title">
              <SectionHeading id="settings-window-title" icon={<ActionIcon name="fullscreen" />}>Cửa sổ</SectionHeading>
              <Switch label="Toàn màn hình" checked={settings.fullscreen} onChange={setFullscreen} />
            </section>
          )
          : null}

        {desktop && updates.available
          ? (
            <section className="settings-panel__section" aria-labelledby="settings-update-title">
              <SectionHeading id="settings-update-title" icon={<ActionIcon name="download" />}>Cập nhật</SectionHeading>
              <UpdateSettingsContent />
            </section>
          )
          : null}
      </div>
    </Modal>
  );
}
