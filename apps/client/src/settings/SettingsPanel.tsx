import Button from '../design-system/components/Button/Button';
import Modal from '../design-system/components/Modal/Modal';
import { getDesktopBridge, isDesktopRuntime } from '../runtime/desktopBridge';
import { ANIMATION_SPEED_OPTIONS } from './defaults';
import { useEffectiveReducedMotion, useSettings } from './selectors';
import './SettingsPanel.css';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

function VolumeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="settings-panel__control">
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
      <output>{Math.round(value * 100)}%</output>
    </label>
  );
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { settings, updateSettings, resetSettings } = useSettings();
  const effectiveReducedMotion = useEffectiveReducedMotion();
  const desktop = isDesktopRuntime();
  const bridge = getDesktopBridge();

  const setFullscreen = (value: boolean) => {
    updateSettings({ fullscreen: value });
    if (bridge) void bridge.window.setFullscreen(value);
  };

  return (
    <Modal open={open} title="Cài đặt" onClose={onClose}>
      <div className="settings-panel">
        <section className="settings-panel__section" aria-labelledby="settings-audio-title">
          <h3 id="settings-audio-title">Âm thanh</h3>
          <VolumeControl label="Âm lượng tổng" value={settings.masterVolume} onChange={value => updateSettings({ masterVolume: value })} />
          <VolumeControl label="Nhạc nền" value={settings.musicVolume} onChange={value => updateSettings({ musicVolume: value })} />
          <VolumeControl label="Hiệu ứng" value={settings.sfxVolume} onChange={value => updateSettings({ sfxVolume: value })} />
        </section>

        <section className="settings-panel__section" aria-labelledby="settings-motion-title">
          <h3 id="settings-motion-title">Hiển thị</h3>
          <label className="settings-panel__control">
            <span>Tốc độ chuyển động</span>
            <select
              value={settings.animationSpeed}
              onChange={event => updateSettings({ animationSpeed: Number(event.target.value) })}
            >
              {ANIMATION_SPEED_OPTIONS.map(option => <option key={option} value={option}>{option}x</option>)}
            </select>
          </label>
          <label className="settings-panel__toggle">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={event => updateSettings({ reducedMotion: event.target.checked })}
            />
            <span>Giảm chuyển động</span>
          </label>
          <p className="settings-panel__hint">
            {effectiveReducedMotion
              ? 'Chuyển động hiện đang được giảm theo cài đặt hoặc hệ điều hành.'
              : 'Chuyển động đang dùng thiết lập bình thường.'}
          </p>
        </section>

        {desktop
          ? (
            <section className="settings-panel__section" aria-labelledby="settings-window-title">
              <h3 id="settings-window-title">Cửa sổ</h3>
              <label className="settings-panel__toggle">
                <input
                  type="checkbox"
                  checked={settings.fullscreen}
                  onChange={event => setFullscreen(event.target.checked)}
                />
                <span>Toàn màn hình</span>
              </label>
            </section>
          )
          : null}

        <div className="settings-panel__actions">
          <Button variant="secondary" onClick={resetSettings}>Khôi phục mặc định</Button>
          <Button onClick={onClose}>Xong</Button>
        </div>
      </div>
    </Modal>
  );
}
