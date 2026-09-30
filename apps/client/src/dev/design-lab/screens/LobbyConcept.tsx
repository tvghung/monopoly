import { useState } from 'react';
import { PLAYER_COLOR_IDS, type CharacterId, type PlayerColorId } from '@monopoly/shared';
import Button from '../../../design-system/components/Button/Button';
import Chip from '../../../design-system/components/Chip/Chip';
import IconButton from '../../../design-system/components/IconButton/IconButton';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import { PLAYER_COLOR_VISUALS } from '../../../game/ui/playerVisualColors';
import { LabSection } from '../labKit';

interface Seat {
  name: string;
  characterId: CharacterId;
  colorId: PlayerColorId;
  host?: boolean;
  ready: boolean;
}

const SEATS: readonly Seat[] = [
  { name: 'An', characterId: 'dog', colorId: 'red', host: true, ready: true },
  { name: 'Bình', characterId: 'panda', colorId: 'blue', ready: true },
  { name: 'Chi', characterId: 'cat', colorId: 'green', ready: false },
];

const TAKEN_COLORS: readonly PlayerColorId[] = ['blue', 'green'];

/** Concept: four seat cards, a mascot stage with a warm spotlight, color chips and the start rule. */
export default function LobbyConcept() {
  const [color, setColor] = useState<PlayerColorId>('red');
  return (
    <LabSection
      id="lobby"
      title="7 · Screen concept: Lobby"
      note="Mascots are identified visually only (OD-04-1): no mascot name is shown."
    >
      <div className="lab-lobby" data-lab-stage="lobby">
        <div className="lab-lobby__main">
          <header className="lab-lobby__header">
            <div>
              <small>Mã phòng</small>
              <p className="lab-lobby__code">P4UAT</p>
            </div>
            <IconButton label="Sao chép mã phòng" icon="copy" />
          </header>

          <ul className="lab-lobby__seats" aria-label="Người chơi trong phòng">
            {SEATS.map(seat => (
              <li key={seat.name} className="lab-seat">
                <PlayerAvatar size={56} characterId={seat.characterId} colorId={seat.colorId} />
                <div className="lab-seat__text">
                  <strong>{seat.name}</strong>
                  <span>
                    {seat.host ? <Chip tone="gold">Chủ phòng</Chip> : null}
                    {seat.ready
                      ? <Chip tone="gain" icon={<ActionIcon name="confirm" />}>Sẵn sàng</Chip>
                      : <Chip>Chưa sẵn sàng</Chip>}
                  </span>
                </div>
              </li>
            ))}
            <li className="lab-seat lab-seat--empty">
              <span className="lab-seat__placeholder" aria-hidden="true">+</span>
              <div className="lab-seat__text"><strong>Chỗ trống</strong><span>Chờ người chơi vào phòng</span></div>
            </li>
          </ul>
        </div>

        <aside className="lab-lobby__stage" aria-label="Chọn mascot và màu">
          <div className="lab-spotlight">
            <IconButton label="Mascot trước" icon="previous" />
            <div className="lab-spotlight__disc">
              <PlayerAvatar size={128} characterId="dog" colorId={color} />
            </div>
            <IconButton label="Mascot sau" icon="next" />
          </div>
          <div className="lab-swatch-row" role="radiogroup" aria-label="Màu người chơi">
            {PLAYER_COLOR_IDS.map(id => {
              const taken = TAKEN_COLORS.includes(id);
              const selected = id === color;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${PLAYER_COLOR_VISUALS[id].label}${taken ? ' (đã dùng)' : ''}`}
                  disabled={taken}
                  className={`lab-color${selected ? ' lab-color--selected' : ''}`}
                  style={{ background: PLAYER_COLOR_VISUALS[id].display }}
                  onClick={() => setColor(id)}
                >
                  {selected ? <ActionIcon name="confirm" size={18} /> : null}
                </button>
              );
            })}
          </div>
          <div className="lab-lobby__actions">
            <Button variant="secondary" size="lg" icon={<ActionIcon name="ready" />}>Sẵn sàng</Button>
            <Button size="lg" icon={<ActionIcon name="start" />} disabled>Bắt đầu</Button>
          </div>
          <p className="lab-lobby__hint">Cần ít nhất 2 người chơi sẵn sàng.</p>
        </aside>
      </div>
    </LabSection>
  );
}
