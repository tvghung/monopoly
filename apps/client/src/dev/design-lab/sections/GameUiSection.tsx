import { useState } from 'react';
import Button from '../../../design-system/components/Button/Button';
import DeltaChip from '../../../design-system/components/DeltaChip/DeltaChip';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import DeedCardConcept from '../concepts/DeedCardConcept';
import PlayerCardConcept, { type PlayerCardConceptState } from '../concepts/PlayerCardConcept';
import { ActionDockConcept, TurnBannerConcept } from '../concepts/TurnAndDockConcepts';
import { LabBlock, LabSection } from '../labKit';

const CARD_STATES: readonly [PlayerCardConceptState, string][] = [
  ['idle', 'Idle'],
  ['active', 'Active turn'],
  ['jail', 'In jail'],
  ['offline', 'Disconnected'],
  ['bankrupt', 'Bankrupt'],
  ['left', 'Left'],
];

const SAMPLE_GROUPS = [
  { group: 'brown', owned: 2, total: 2 },
  { group: 'lightblue', owned: 1, total: 3 },
  { group: 'pink', owned: 0, total: 3 },
  { group: 'orange', owned: 3, total: 3 },
  { group: 'red', owned: 0, total: 3 },
  { group: 'yellow', owned: 1, total: 3 },
  { group: 'green', owned: 0, total: 3 },
  { group: 'blue', owned: 1, total: 2 },
] as const;

export default function GameUiSection() {
  const reducedMotion = useEffectiveReducedMotion();
  const [run, setRun] = useState(0);
  return (
    <LabSection
      id="game-ui"
      title="4 · Game UI concepts"
      note="Static concepts built only from primitives. They show direction for plans 03 and 04; they are not production components."
    >
      <LabBlock caption="Player card · every state" wide>
        <div className="lab-cards">
          {CARD_STATES.map(([state, caption]) => (
            <div key={state} className="lab-state">
              <small>{caption}</small>
              <PlayerCardConcept
                name={state === 'left' ? 'Chi' : 'An'}
                characterId={state === 'left' ? 'cat' : 'dog'}
                colorId={state === 'left' ? 'green' : 'red'}
                money={1_500}
                state={state}
                isYou={state === 'active'}
                groups={SAMPLE_GROUPS}
              />
            </div>
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="Money deltas" wide>
        <div className="lab-matrix__row" key={run}>
          <DeltaChip delta={200} reducedMotion={reducedMotion} />
          <DeltaChip delta={-80} reducedMotion={reducedMotion} />
          <DeltaChip delta={-1_500} reducedMotion={reducedMotion} />
          <Button variant="ghost" size="sm" onClick={() => setRun(value => value + 1)}>Phát lại</Button>
        </div>
      </LabBlock>

      <LabBlock caption="Turn banner" wide>
        <div className="lab-banners">
          <TurnBannerConcept name="Bình" characterId="panda" colorId="blue" />
          <TurnBannerConcept name="An" characterId="dog" colorId="red" mine />
        </div>
      </LabBlock>

      <LabBlock caption="Deed card">
        <DeedCardConcept />
      </LabBlock>

      <LabBlock caption="Action dock" wide>
        <ActionDockConcept />
      </LabBlock>
    </LabSection>
  );
}
