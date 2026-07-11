import { Icon } from '../Icons';

// --- Fog overlay (Cloak/Blind) ------------------------------------------------------

export function FogOverlay({
  left,
  width,
  height,
  label,
}: {
  left: number;
  width: number;
  height: number;
  label: string;
}) {
  return (
    <div className="fog-overlay" style={{ left, top: 0, width, height }}>
      <span className="fog-pill">
        <Icon name="eyeOff" size={14} color="#fff" />
        {label}
      </span>
    </div>
  );
}
