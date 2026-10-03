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
  failed: 'Không sao chép được. Hãy cho bạn bè quét mã QR.',
} as const;

const NO_NETWORK_COPY = 'Máy này chưa kết nối mạng. Hãy bật Wi-Fi hoặc cắm dây mạng.';

/**
 * The invitation card of a LAN host: the join link as a QR code on a paper card plus a copy button (the link itself is
 * never shown). The network is chosen automatically; the choice is only offered when two or more networks rank equally
 * well, because then the app cannot tell which one the other players are on.
 */
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
  const selectedAddress = status?.selectedLanUrl ? new URL(status.selectedLanUrl).hostname : '';
  const interfaces = status?.interfaces ?? [];
  const bestRank = Math.min(...interfaces.map(candidate => candidate.rank));
  const equallyGood = interfaces.filter(candidate => candidate.rank === bestRank);
  // Only a tie needs the player: the networks listed are the tied ones, plus the one in use if it ranks lower.
  const networkChoices = equallyGood.length > 1
    ? interfaces.filter(candidate => candidate.rank === bestRank || candidate.address === selectedAddress)
    : [];
  return (
    <aside className="lobby-share" aria-labelledby="lobby-share-title">
      <div className="lobby-share__details">
        <p className="lobby__eyebrow" id="lobby-share-title">Mời qua mạng LAN</p>
        {status && !joinUrl ? <p className="lobby-share__warning" role="status">{NO_NETWORK_COPY}</p> : null}
        {networkChoices.length > 0 ? (
          <label className="lobby-share__network">
            <span>Mạng chia sẻ</span>
            <select
              value={selectedAddress}
              onChange={event => void refresh(event.target.value)}
            >
              {networkChoices.map(candidate => (
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
          {networkChoices.length > 0 ? (
            <Button variant="ghost" icon={<ActionIcon name="refresh" />} disabled={refreshing} onClick={() => void refresh()}>
              {refreshing ? 'Đang làm mới…' : 'Làm mới mạng'}
            </Button>
          ) : null}
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
