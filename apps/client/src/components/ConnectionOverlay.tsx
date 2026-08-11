interface ConnectionOverlayProps {
  message?: string;
}

export default function ConnectionOverlay({
  message = 'Connection lost. Reconnecting to your game…',
}: ConnectionOverlayProps) {
  return (
    <div className="connection-overlay" role="status" aria-live="polite">
      <div className="connection-overlay__card">
        <span className="connection-overlay__spinner" aria-hidden="true" />
        <p>{message}</p>
      </div>
    </div>
  );
}
