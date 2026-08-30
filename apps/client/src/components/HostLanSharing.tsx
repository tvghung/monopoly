import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getDesktopBridge } from '../runtime/desktopBridge';
import { buildLanJoinUrl } from '../runtime/lanSharing';
import type { HostRuntimeStatus } from '../runtime/types';

interface HostLanSharingProps {
  roomCode: string;
}

function fallbackCopy(value: string): boolean {
  const input = document.createElement('textarea');
  input.value = value;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand?.('copy') ?? false;
  input.remove();
  return copied;
}

export async function copyLanJoinUrl(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // The DOM copy fallback below still works when clipboard permission is denied.
  }
  return fallbackCopy(value);
}

export default function HostLanSharing({ roomCode }: HostLanSharingProps) {
  const bridge = getDesktopBridge();
  const [status, setStatus] = useState<HostRuntimeStatus>();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [refreshing, setRefreshing] = useState(false);

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
        <strong className="lobby-share__room">{roomCode}</strong>
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
          <button
            type="button"
            disabled={!joinUrl}
            onClick={() => {
              if (!joinUrl) return;
              void copyLanJoinUrl(joinUrl).then(copied => setCopyState(copied ? 'copied' : 'failed'));
            }}
          >
            Sao chép liên kết
          </button>
          <button type="button" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? 'Đang làm mới…' : 'Làm mới mạng'}
          </button>
        </div>
        <p className="lobby-share__copy-state" aria-live="polite">
          {copyState === 'copied' ? 'Đã sao chép.' : copyState === 'failed' ? 'Không thể sao chép tự động; hãy chọn liên kết ở trên.' : ''}
        </p>
      </div>
      {joinUrl && qrDataUrl ? (
        <img
          className="lobby-share__qr"
          src={qrDataUrl}
          alt={`Mã QR tham gia phòng ${roomCode}`}
          data-qr-payload={joinUrl}
        />
      ) : null}
    </aside>
  );
}
