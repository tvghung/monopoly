import Panel from '../design-system/components/Panel/Panel';
import HowToPlayButton from '../howToPlay/HowToPlayButton';
import './style/RoomStatus.css';

interface ConnectionOverlayProps {
  message?: string;
}

/**
 * Shown over the game while the socket reconnects; it sits above the card layer so a card reveal cannot hide it. The status
 * is the card alone, so the how-to-play key beside it (reading the rules is a good way to wait) is not announced with it.
 */
export default function ConnectionOverlay({
  message = 'Đã mất kết nối. Đang kết nối lại vào ván chơi…',
}: ConnectionOverlayProps) {
  return (
    <div className="connection-overlay">
      <div className="connection-overlay__status" role="status" aria-live="polite">
        <Panel as="div" padding="lg" className="connection-overlay__card">
          <span className="connection-overlay__spinner" aria-hidden="true" />
          <p>{message}</p>
        </Panel>
      </div>
      <HowToPlayButton placement="corner" />
    </div>
  );
}
