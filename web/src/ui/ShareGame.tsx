import { useMemo, useState } from 'react';
import { Icon } from './Icons';
import { BASE_URL } from './assets';
import { qrMatrix } from './qrcode';

// Share screen: a native share button (Android/iOS share sheet via the Web
// Share API) plus a scannable QR code, so a kid can hand their phone to a
// friend and get them playing without typing a URL.

/** The public URL of this deployment (e.g. https://user.github.io/Chess/). */
function gameUrl(): string {
  try {
    return new URL(BASE_URL, window.location.origin).href;
  } catch {
    return BASE_URL;
  }
}

const SHARE_TITLE = 'Neon City: Bug Busters';
const SHARE_TEXT = 'Come play Neon City: Bug Busters with me! 🤖⚡';

/** Renders a QR matrix as a crisp, scannable SVG with a white quiet zone. */
function QrImage({ value }: { value: string }) {
  const modules = useMemo(() => qrMatrix(value), [value]);
  const size = modules.length;
  const quiet = 4; // standard 4-module quiet zone
  const dim = size + quiet * 2;

  let d = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }

  return (
    <svg
      className="qr-svg"
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={`QR code linking to ${value}`}
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={dim} height={dim} fill="#ffffff" />
      <path d={d} fill="#0b1020" />
    </svg>
  );
}

export function ShareGame({ onBack }: { onBack: () => void }) {
  const url = useMemo(() => gameUrl(), []);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleShare = async () => {
    try {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
    } catch {
      // User dismissed the share sheet, or sharing failed — nothing to do.
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable (insecure context etc.) — the link is on screen.
    }
  };

  return (
    <div className="screen doodle-bg howto">
      <div className="overlay-header">
        <button className="chip" onClick={onBack}>
          <Icon name="arrowBack" size={20} color="#e8f4ff" />
          Menu
        </button>
        <span style={{ flex: 1 }} />
        <span className="chip">Share</span>
      </div>

      <div className="howto-scroll">
        <div className="howto-card share-card">
          <h2 className="howto-heading">Share the game</h2>
          <p className="story-p" style={{ textAlign: 'center' }}>
            Scan this code with a phone camera to jump straight into Neon City.
          </p>

          <div className="qr-frame">
            <QrImage value={url} />
          </div>

          <div className="share-url">{url}</div>

          <div className="share-actions">
            {canShare && (
              <button className="img-btn yellow menu-btn" onClick={handleShare}>
                <span className="share-btn-label">
                  <Icon name="share" size={18} color="#1a1030" />
                  Share…
                </span>
              </button>
            )}
            <button className="img-btn grey menu-btn" onClick={handleCopy}>
              <span className="share-btn-label">
                <Icon name={copied ? 'check' : 'copy'} size={18} color="#e8f4ff" />
                {copied ? 'Link copied!' : 'Copy link'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
