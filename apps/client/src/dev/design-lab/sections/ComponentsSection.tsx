import { useState, type ReactNode } from 'react';
import { CHARACTER_IDS, type PlayerColorId } from '@monopoly/shared';
import Badge from '../../../design-system/components/Badge/Badge';
import Button, { type ButtonSize, type ButtonVariant } from '../../../design-system/components/Button/Button';
import Chip from '../../../design-system/components/Chip/Chip';
import ConfirmationDialog from '../../../design-system/components/ConfirmationDialog/ConfirmationDialog';
import DeltaChip from '../../../design-system/components/DeltaChip/DeltaChip';
import GroupPips from '../../../design-system/components/GroupPips/GroupPips';
import IconButton from '../../../design-system/components/IconButton/IconButton';
import Modal from '../../../design-system/components/Modal/Modal';
import MoneyText from '../../../design-system/components/MoneyText/MoneyText';
import Panel from '../../../design-system/components/Panel/Panel';
import PlayerAvatar, { type PlayerAvatarStatus } from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import SegmentedControl from '../../../design-system/components/SegmentedControl/SegmentedControl';
import Slider from '../../../design-system/components/Slider/Slider';
import Switch from '../../../design-system/components/Switch/Switch';
import ToastView from '../../../design-system/components/Toast/ToastView';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import { LabBlock, LabSection } from '../labKit';

const VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'danger', 'ghost'];
const SIZES: readonly ButtonSize[] = ['sm', 'md', 'lg', 'xl'];
const AVATAR_SIZES = [32, 36, 44, 48, 56, 64, 128] as const;
const AVATAR_STATUSES: readonly PlayerAvatarStatus[] = ['online', 'offline', 'bankrupt', 'left'];
const SPEEDS = [
  { value: 0.75, label: '0,75×' },
  { value: 1, label: '1×' },
  { value: 1.5, label: '1,5×' },
  { value: 2, label: '2×' },
] as const;

function StateCell({ caption, state, children }: { caption: string; state?: 'hover' | 'active' | 'focus'; children: ReactNode }) {
  return (
    <div className={`lab-state${state ? ` lab-force-${state}` : ''}`}>
      <small>{caption}</small>
      {children}
    </div>
  );
}

export default function ComponentsSection() {
  const reducedMotion = useEffectiveReducedMotion();
  const [speed, setSpeed] = useState<number>(1);
  const [volume, setVolume] = useState(0.7);
  const [motion, setMotion] = useState(false);
  const [fullscreen, setFullscreen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deltaRun, setDeltaRun] = useState(0);

  return (
    <LabSection
      id="components"
      title="3 · Components"
      note="Every primitive in every state. Hover, press and focus are forced with lab-only classes that mirror the real rules."
    >
      <LabBlock caption="Button · variants × sizes" wide>
        <div className="lab-matrix">
          {VARIANTS.map(variant => (
            <div key={variant} className="lab-matrix__row">
              <small>{variant}</small>
              {SIZES.map(size => (
                <Button key={size} variant={variant} size={size} icon={<ActionIcon name="roll" />}>
                  {size === 'xl' ? 'Đổ xúc xắc' : `Nút ${size}`}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="Button · states (primary and secondary)" wide>
        <div className="lab-matrix">
          {(['primary', 'secondary', 'danger', 'ghost'] as const).map(variant => (
            <div key={variant} className="lab-matrix__row">
              <StateCell caption="default"><Button variant={variant}>Mua ngay</Button></StateCell>
              <StateCell caption="hover" state="hover"><Button variant={variant}>Mua ngay</Button></StateCell>
              <StateCell caption="active" state="active"><Button variant={variant}>Mua ngay</Button></StateCell>
              <StateCell caption="focus" state="focus"><Button variant={variant}>Mua ngay</Button></StateCell>
              <StateCell caption="disabled"><Button variant={variant} disabled>Mua ngay</Button></StateCell>
              <StateCell caption="busy"><Button variant={variant} busy>Đang gửi</Button></StateCell>
            </div>
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="IconButton · md / lg · pressed · badge · disabled" wide>
        <div className="lab-matrix__row">
          <IconButton label="Cài đặt" icon="settings" />
          <IconButton label="Cài đặt" icon="settings" size="lg" />
          <IconButton label="Trò chuyện" icon="chat" pressed />
          <IconButton label="Trò chuyện" icon="chat" badge={3} />
          <IconButton label="Tài sản" icon="view" disabled />
          <StateCell caption="hover" state="hover"><IconButton label="Đóng" icon="close" /></StateCell>
          <StateCell caption="focus" state="focus"><IconButton label="Đóng" icon="close" /></StateCell>
        </div>
      </LabBlock>

      <LabBlock caption="Action icon registry" wide>
        <div className="lab-icons">
          {(['settings', 'leave', 'forfeit', 'close', 'confirm', 'start', 'retry', 'reset', 'join', 'back', 'host',
            'copy', 'send', 'chat', 'roll', 'buy', 'build', 'buildHotel', 'skip', 'bail', 'jailCard', 'sellToBank',
            'propose', 'view', 'sellHouse', 'reject', 'offline', 'previous', 'next'] as const).map(name => (
            <span key={name} className="lab-icon"><ActionIcon name={name} size={24} /><small>{name}</small></span>
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="Badge · Chip">
        <div className="lab-matrix__row">
          {(['neutral', 'success', 'warning', 'danger', 'info'] as const).map(variant => (
            <Badge key={variant} variant={variant}>{variant}</Badge>
          ))}
        </div>
        <div className="lab-matrix__row">
          <Chip>Chờ</Chip>
          <Chip tone="gain" icon={<ActionIcon name="confirm" />}>Sẵn sàng</Chip>
          <Chip tone="loss" icon={<ActionIcon name="forfeit" />}>Phá sản</Chip>
          <Chip tone="info">Bạn</Chip>
          <Chip tone="gold">Đang chơi</Chip>
        </div>
      </LabBlock>

      <LabBlock caption="SegmentedControl · Switch · Slider">
        <SegmentedControl label="Tốc độ hoạt ảnh" options={SPEEDS} value={speed} onChange={setSpeed} />
        <Switch label="Giảm chuyển động" description="Tắt hiệu ứng chuyển động." checked={motion} onChange={setMotion} />
        <Switch label="Toàn màn hình" checked={fullscreen} onChange={setFullscreen} />
        <Switch label="Không khả dụng" checked={false} onChange={() => {}} disabled />
        <Slider
          label="Âm lượng"
          value={volume}
          min={0}
          max={1}
          step={0.05}
          onChange={setVolume}
          formatValue={value => `${Math.round(value * 100)}%`}
        />
      </LabBlock>

      <LabBlock caption="MoneyText · DeltaChip">
        <div className="lab-matrix__row">
          <MoneyText amount={1_500} size="sm" />
          <MoneyText amount={1_500} />
          <MoneyText amount={1_500} size="lg" />
        </div>
        <div className="lab-matrix__row">
          <MoneyText amount={100} tone="gain" />
          <MoneyText amount={6} tone="loss" />
          <MoneyText amount={-40} signed />
          <MoneyText amount={40} signed />
        </div>
        <div className="lab-matrix__row" key={deltaRun}>
          <DeltaChip delta={200} reducedMotion={reducedMotion} />
          <DeltaChip delta={-80} reducedMotion={reducedMotion} />
          <DeltaChip delta={0} reducedMotion={reducedMotion} />
          <Button variant="ghost" size="sm" onClick={() => setDeltaRun(run => run + 1)}>Phát lại</Button>
        </div>
      </LabBlock>

      <LabBlock caption="PlayerAvatar · sizes, statuses and active turn" wide>
        <div className="lab-matrix__row">
          {AVATAR_SIZES.map((size, index) => (
            <PlayerAvatar
              key={size}
              size={size}
              characterId={CHARACTER_IDS[index % CHARACTER_IDS.length]}
              colorId={(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink'] as PlayerColorId[])[index]}
            />
          ))}
        </div>
        <div className="lab-matrix__row">
          {AVATAR_STATUSES.map((status, index) => (
            <StateCell key={status} caption={status}>
              <PlayerAvatar size={64} status={status} characterId={CHARACTER_IDS[index]} colorId="cyan" />
            </StateCell>
          ))}
          <StateCell caption="active turn"><PlayerAvatar size={64} active characterId="dog" colorId="red" /></StateCell>
        </div>
        <div className="lab-matrix__row">
          {CHARACTER_IDS.map((characterId, index) => (
            <PlayerAvatar
              key={characterId}
              size={56}
              characterId={characterId}
              colorId={(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'] as PlayerColorId[])[index]}
            />
          ))}
        </div>
      </LabBlock>

      <LabBlock caption="GroupPips">
        <GroupPips
          groups={[
            { group: 'brown', owned: 2, total: 2 },
            { group: 'lightblue', owned: 1, total: 3 },
            { group: 'pink', owned: 0, total: 3 },
            { group: 'orange', owned: 3, total: 3 },
            { group: 'red', owned: 2, total: 3 },
            { group: 'yellow', owned: 0, total: 3 },
            { group: 'green', owned: 1, total: 3 },
            { group: 'blue', owned: 2, total: 2 },
          ]}
        />
      </LabBlock>

      <LabBlock caption="Panel · tones and padding">
        <div className="lab-panels">
          <Panel title="Paper" tone="paper">Nội dung bảng.</Panel>
          <Panel title="Soft" tone="soft" padding="sm">Nội dung bảng.</Panel>
          <Panel title="Sunken" tone="sunken" padding="lg">Nội dung bảng.</Panel>
        </div>
      </LabBlock>

      <LabBlock caption="Modal · ConfirmationDialog · Toast">
        <div className="lab-matrix__row">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>Mở Modal</Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>Mở xác nhận</Button>
        </div>
        <div className="lab-toasts">
          <ToastView message="Đã sao chép mã phòng." variant="success" />
          <ToastView message="Mất kết nối, đang thử lại…" variant="warning" />
          <ToastView message="Không thể vào phòng." variant="error" />
        </div>
        <Modal open={modalOpen} title="Tài sản của tôi" onClose={() => setModalOpen(false)}>
          <p>Hộp thoại dùng token v2: nền giấy, viền mảnh, đổ bóng ấm.</p>
          <Button onClick={() => setModalOpen(false)} data-modal-autofocus>Đóng</Button>
        </Modal>
        <ConfirmationDialog
          open={confirmOpen}
          title="Bỏ cuộc?"
          message="Bạn sẽ rời ván chơi này."
          confirmLabel="Bỏ cuộc"
          onConfirm={() => setConfirmOpen(false)}
          onCancel={() => setConfirmOpen(false)}
        />
      </LabBlock>
    </LabSection>
  );
}
