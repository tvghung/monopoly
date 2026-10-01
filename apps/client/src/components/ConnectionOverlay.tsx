import Panel from '../design-system/components/Panel/Panel';
import './style/RoomStatus.css';

interface ConnectionOverlayProps {
  message?: string;
}

/** Shown over the game while the socket reconnects; it sits above the card layer so a card reveal cannot hide it. */
export default function ConnectionOverlay({
  message = 'Đã mất kết nối. Đang kết nối lại vào ván chơi…',
}: ConnectionOverlayProps) {
  return (
    <div className="connection-overlay" role="status" aria-live="polite">
      <Panel as="div" padding="lg" className="connection-overlay__card">
        <span className="connection-overlay__spinner" aria-hidden="true" />
        <p>{message}</p>
      </Panel>
    </div>
  );
}
