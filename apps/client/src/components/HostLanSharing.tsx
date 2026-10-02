import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Button from '../design-system/components/Button/Button';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import { getDesktopBridge } from '../runtime/desktopBridge';
import { buildLanJoinUrl } from '../runtime/lanSharing';
import type { HostRuntimeStatus } from '../runtime/types';
import { useCopyFeedback } from './lobby/copyText';

interface HostLanSharingProps {
  roomCode: string;
}

const COPY_NOTICES = {
  idle: '',
  copied: 'Đã sao chép.',
  failed: 'Không thể sao chép tự động; hãy chọn liên kết ở trên.',
} as const;

/** The invitation card of a LAN host: the join link as text and as a QR code on a paper card, and the network it is shared on. */
export default function HostLanSharing({ roomCode }: HostLanSharingProps) {
  const bridge = getDesktopBridge();
  const [status, setStatus] = useState<HostRuntimeStatus>();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const linkCopy = useCopyFeedback();

  useEffect(() => {
    if (!bridge?.host) return undefined;
    let active = true;
    void bridge.host.getStatus().then(next => {
      if (active) setStatus(next);
    });
    const remove = bridge.host.onStatusChanged(next => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
      remove();
    };
  }, [bridge]);

  const joinUrl = (() => {
    if (!status?.selectedLanUrl) return undefined;
    try {
      return buildLanJoinUrl(status.selectedLanUrl, roomCode);
    } catch {
      return undefined;
    }
  })();

  useEffect(() => {
    let active = true;
    setQrDataUrl('');
    if (joinUrl) {
      void QRCode.toDataURL(joinUrl, {
        width: 184,
        margin: 1,
        errorCorrectionLevel: 'M',
      }).then(value => {
        if (active) setQrDataUrl(value);
      });
    }
    return () => {
      active = false;
    };
  }, [joinUrl]);

  const refresh = async (preferredAddress?: string): Promise<void> => {
    if (!bridge?.host) return;
    setRefreshing(true);
    try {
      setStatus(await bridge.host.refreshNetwork(
        preferredAddress ? { preferredAddress } : undefined,
      ));
    } finally {
      setRefreshing(false);
    }
  };

  if (!bridge?.host) return null;
  return (
    <aside className="lobby-share" aria-labelledby="lobby-share-title">
      <div className="lobby-share__details">
        <p className="lobby__eyebrow" id="lobby-share-title">Mời qua mạng LAN</p>
        {joinUrl ? <code className="lobby-share__url">{joinUrl}</code> : (
          <p className="lobby-share__warning" role="status">Chưa có địa chỉ IPv4 LAN dùng được.</p>
        )}
        {status && status.interfaces.length > 1 ? (
          <label className="lobby-share__network">
            <span>Mạng chia sẻ</span>
            <select
              value={status.selectedLanUrl ? new URL(status.selectedLanUrl).hostname : ''}
              onChange={event => void refresh(event.target.value)}
            >
              {status.interfaces.map(candidate => (
                <option key={candidate.address} value={candidate.address}>
                  {candidate.displayName} — {candidate.address}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="lobby-share__actions">
          <Button
            variant="secondary"
            icon={<ActionIcon name="copy" />}
            disabled={!joinUrl}
            onClick={() => {
              if (joinUrl) linkCopy.copy(joinUrl);
            }}
          >
            Sao chép liên kết
          </Button>
          <Button variant="ghost" icon={<ActionIcon name="refresh" />} disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? 'Đang làm mới…' : 'Làm mới mạng'}
          </Button>
        </div>
        <p className="lobby-share__copy-state" aria-live="polite">{COPY_NOTICES[linkCopy.state]}</p>
      </div>
      {joinUrl && qrDataUrl ? (
        <figure className="lobby-share__qr-card">
          <img
            className="lobby-share__qr"
            src={qrDataUrl}
            alt={`Mã QR tham gia phòng ${roomCode}`}
            data-qr-payload={joinUrl}
          />
          <figcaption>Quét mã để vào phòng</figcaption>
        </figure>
      ) : null}
    </aside>
  );
}
