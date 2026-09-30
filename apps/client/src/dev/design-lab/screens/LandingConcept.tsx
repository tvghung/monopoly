import { useState } from 'react';
import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import Button from '../../../design-system/components/Button/Button';
import Panel from '../../../design-system/components/Panel/Panel';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import SegmentedControl from '../../../design-system/components/SegmentedControl/SegmentedControl';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import { LabSection } from '../labKit';

const HERO_MASCOTS: readonly [CharacterId, PlayerColorId][] = [
  ['panda', 'blue'],
  ['dog', 'red'],
  ['cat', 'green'],
  ['rabbit', 'purple'],
  ['duck', 'orange'],
];

type JoinMode = 'code' | 'public';

/** Concept: a hero lockup with the mascot cast, and one calm join card with the room-mode toggle. */
export default function LandingConcept() {
  const [mode, setMode] = useState<JoinMode>('code');
  return (
    <LabSection
      id="landing"
      title="8 · Screen concept: Landing"
      note="Hero art is a composition of the existing mascots (OD-04-7); the room toggle defaults to 'Có mã phòng' (OD-04-6)."
    >
      <div className="lab-landing" data-lab-stage="landing">
        <div className="lab-landing__hero">
          <p className="lab-landing__eyebrow">Trò chơi bàn cờ cho cả nhà</p>
          <h3 className="lab-landing__title">
            <span>Cờ Tỷ Phú</span>
            <span>Việt Nam</span>
          </h3>
          <p className="lab-landing__tagline">Mua phố, xây nhà, thu tiền thuê — vui cùng bạn bè.</p>
          <div className="lab-landing__cast" aria-hidden="true">
            {HERO_MASCOTS.map(([characterId, colorId], index) => (
              <span key={characterId} className="lab-landing__cast-member" style={{ ['--lab-cast-index' as string]: index }}>
                <PlayerAvatar size={96} characterId={characterId} colorId={colorId} />
              </span>
            ))}
          </div>
        </div>

        <Panel className="lab-landing__card" tone="paper" padding="lg" title="Vào phòng chơi">
          <form className="lab-form" onSubmit={event => event.preventDefault()}>
            <label className="lab-field">
              <span>Tên của bạn</span>
              <input className="lab-input" type="text" placeholder="Nhập tên" defaultValue="An" />
            </label>
            <SegmentedControl
              label="Kiểu phòng"
              options={[{ value: 'code', label: 'Có mã phòng' }, { value: 'public', label: 'Phòng chung' }]}
              value={mode}
              onChange={setMode}
            />
            {mode === 'code'
              ? (
                <label className="lab-field">
                  <span>Mã phòng</span>
                  <input className="lab-input" type="text" placeholder="Ví dụ: P4UAT" defaultValue="P4UAT" />
                </label>
              )
              : <p className="lab-form__note">Bạn sẽ vào phòng chung đang chờ người chơi.</p>}
            <Button type="submit" size="xl" icon={<ActionIcon name="join" />}>Vào chơi</Button>
          </form>
        </Panel>
      </div>
    </LabSection>
  );
}
