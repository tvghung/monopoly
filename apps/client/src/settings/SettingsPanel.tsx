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
import { useTranslation } from '../i18n/I18n';
import type { Language } from '../i18n/I18n';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';

const VOLUME_CONTROLS: readonly { key: 'masterVolume' | 'musicVolume' | 'sfxVolume'; labelKey: 'settings.masterVolume' | 'settings.music' | 'settings.effects' }[] = [
  { key: 'masterVolume', labelKey: 'settings.masterVolume' },
  { key: 'musicVolume', labelKey: 'settings.music' },
  { key: 'sfxVolume', labelKey: 'settings.effects' },
];

const SPEED_CHOICES = ANIMATION_SPEED_OPTIONS.map(option => ({ value: option, label: `${option}x` }));

const GRAPHICS_QUALITY_CHOICES: readonly { value: GraphicsQualitySetting; labelKey: 'settings.qualityAuto' | 'settings.qualityHigh' | 'settings.qualityBalanced' | 'settings.qualityLow' }[] = [
  { value: 'auto', labelKey: 'settings.qualityAuto' },
  { value: 'high', labelKey: 'settings.qualityHigh' },
  { value: 'balanced', labelKey: 'settings.qualityBalanced' },
  { value: 'low', labelKey: 'settings.qualityLow' },
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
  const { t } = useTranslation();
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
      title={t('settings.title')}
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
            {t('settings.reset')}
          </Button>
          <Button icon={<ActionIcon name="confirm" />} onClick={onClose}>{t('settings.done')}</Button>
        </>
      )}
    >
      <div className="settings-panel">
        <section className="settings-panel__section" aria-labelledby="settings-language-title">
          <SectionHeading id="settings-language-title" icon={<ActionIcon name="settings" />}>{t('language.label')}</SectionHeading>
          <SegmentedField<Language>
            label={t('language.label')}
            options={SUPPORTED_LANGUAGES.map(({ code, labelKey }) => ({ value: code, label: t(labelKey) }))}
            value={settings.language}
            onChange={language => updateSettings({ language })}
          />
        </section>
        <section className="settings-panel__section" aria-labelledby="settings-audio-title">
          <SectionHeading id="settings-audio-title" icon={<ActionIcon name="volume" />}>{t('settings.audio')}</SectionHeading>
          <div className="settings-panel__field">
            <Switch
              label={t('settings.mute')}
              checked={settings.muted}
              onChange={checked => updateSettings({ muted: checked })}
            />
          </div>
          {VOLUME_CONTROLS.map(({ key, labelKey }) => (
            <Slider
              key={key}
              label={t(labelKey)}
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
          <SectionHeading id="settings-motion-title" icon={<ActionIcon name="speed" />}>{t('settings.display')}</SectionHeading>
          <SegmentedField
            label={t('settings.animationSpeed')}
            options={SPEED_CHOICES}
            value={settings.animationSpeed}
            onChange={value => updateSettings({ animationSpeed: value })}
          />
          <div className="settings-panel__field">
            <Switch
              label={t('settings.reducedMotion')}
              checked={settings.reducedMotion}
              describedBy="settings-motion-hint"
              onChange={checked => updateSettings({ reducedMotion: checked })}
            />
            <p id="settings-motion-hint" className="settings-panel__hint" aria-live="polite">
              {effectiveReducedMotion
                ? t('settings.reducedMotionEffective')
                : t('settings.reducedMotionNormal')}
            </p>
          </div>
        </section>

        <section className="settings-panel__section" aria-labelledby="settings-graphics-title">
          <SectionHeading id="settings-graphics-title" icon={<Monitor />}>{t('settings.graphics')}</SectionHeading>
          <SegmentedField
            label={t('settings.graphicsQuality')}
            options={GRAPHICS_QUALITY_CHOICES.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
            value={settings.graphicsQuality}
            onChange={value => updateSettings({ graphicsQuality: value })}
            hint={t('settings.graphicsHint')}
          />
        </section>

        {desktop
          ? (
            <section className="settings-panel__section" aria-labelledby="settings-window-title">
              <SectionHeading id="settings-window-title" icon={<ActionIcon name="fullscreen" />}>{t('settings.window')}</SectionHeading>
              <Switch label={t('settings.fullscreen')} checked={settings.fullscreen} onChange={setFullscreen} />
            </section>
          )
          : null}

        {desktop && updates.available
          ? (
            <section className="settings-panel__section" aria-labelledby="settings-update-title">
              <SectionHeading id="settings-update-title" icon={<ActionIcon name="download" />}>{t('settings.update')}</SectionHeading>
              <UpdateSettingsContent />
            </section>
          )
          : null}
      </div>
    </Modal>
  );
}
