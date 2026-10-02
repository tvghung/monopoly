import { useContext } from 'react';
import Chip from '../../../design-system/components/Chip/Chip';
import MoneyText from '../../../design-system/components/MoneyText/MoneyText';
import stateContext from '../../../internal';
import { ActionDockConcept, TurnBannerConcept } from '../concepts/TurnAndDockConcepts';
import PlayerCardConcept, { type PlayerCardConceptState } from '../concepts/PlayerCardConcept';
import { useLabFontsLoaded } from '../labKit';

const SLOT_CLASSES = ['bottom-left', 'top-left', 'top-right', 'bottom-right'] as const;

const SAMPLE_GROUPS = [
  { group: 'brown', owned: 2, total: 2 },
  { group: 'lightblue', owned: 1, total: 3 },
  { group: 'orange', owned: 3, total: 3 },
  { group: 'red', owned: 0, total: 3 },
  { group: 'yellow', owned: 1, total: 3 },
  { group: 'blue', owned: 0, total: 2 },
] as const;

/**
 * Concept overlay drawn over the real harness `Board` (stations-4 fixture). Labelled as a concept:
 * plan 03 builds the production HUD. Data comes from the fixture through the state context.
 */
export default function HudConcept({ ready }: { ready: boolean }) {
  const fontsLoaded = useLabFontsLoaded();
  const { state, playerId, roomPlayers = [] } = useContext(stateContext);
  const orderedIds = state.boardState.players;
  const activeId = state.boardState.currentPlayer.id;

  return (
    <div className="lab-hud" data-design-lab-ready={ready && fontsLoaded ? 'true' : 'false'} data-lab-section="hud">
      <p className="lab-hud__concept-tag">Concept — không phải HUD cuối cùng</p>
      <div className="lab-hud__status">
        <Chip tone="gold">Lượt {state.boardState.turnNumber}</Chip>
        <span>An đang chờ đổ xúc xắc</span>
      </div>

      {orderedIds.map((id, index) => {
        const player = state.players[id];
        const meta = roomPlayers.find(candidate => candidate.playerId === id);
        const cardState: PlayerCardConceptState = !meta?.connected
          ? 'offline'
          : id === activeId ? 'active' : 'idle';
        return (
          <PlayerCardConcept
            key={id}
            className={`lab-hud__card lab-hud__card--${SLOT_CLASSES[index]}`}
            name={player.name}
            characterId={player.characterId}
            colorId={player.color}
            money={player.accountBalance}
            state={cardState}
            isYou={id === playerId}
            groups={SAMPLE_GROUPS}
            compact
          />
        );
      })}

      <div className="lab-hud__stage">
        <TurnBannerConcept name="An" characterId="dog" colorId="red" mine />
        <div className="lab-hud__dice" aria-label="Kết quả xúc xắc">
          <small>Xúc xắc</small>
          <strong>8</strong>
          <span>3 + 5 · An đi đến Đà Nẵng</span>
        </div>
        <MoneyText amount={-6} tone="loss" size="lg" className="lab-hud__delta" />
      </div>

      <div className="lab-hud__dock">
        <ActionDockConcept compact withRoll={false} />
      </div>
    </div>
  );
}
