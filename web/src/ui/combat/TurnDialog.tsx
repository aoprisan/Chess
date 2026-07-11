import { Character } from '../../game/characters';
import { CharacterPortrait } from '../CharacterPortrait';
import { useT } from '../../i18n';
import { clamp } from './theme';

// --- Turn dialog ------------------------------------------------------------------

export function TurnDialog({
  W,
  hero,
  isP1,
  isAI,
  isOpeningTurn,
  onReady,
}: {
  W: number;
  hero: Character;
  isP1: boolean;
  isAI: boolean;
  isOpeningTurn: boolean;
  onReady: () => void;
}) {
  const t = useT();
  const playerColor = isP1 ? '#00e5ff' : '#ff2fd6';
  const cardW = clamp(W * 0.35, 220, 400);
  const padding = clamp(W * 0.025, 16, 30);
  const avatarSize = clamp(W * 0.12, 80, 150);
  return (
    <div className="modal-scrim" style={{ zIndex: 30 }}>
      <div
        style={{
          width: cardW,
          padding,
          background: '#131a2e',
          borderRadius: 20,
          border: `3px solid ${playerColor}`,
          boxShadow: `0 0 20px 4px ${playerColor}66`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <CharacterPortrait
          character={hero}
          style={{ width: avatarSize, height: avatarSize, objectFit: 'contain' }}
        />
        <div style={{ height: padding * 0.5 }} />
        <span style={{ fontSize: clamp(W * 0.028, 18, 32), fontWeight: 700, color: playerColor }}>
          {hero.name}
        </span>
        <div style={{ height: padding * 0.25 }} />
        <span style={{ fontSize: clamp(W * 0.02, 14, 24), fontWeight: 500, color: '#fff' }}>
          {t('combat.yourTurn')}
        </span>
        {isOpeningTurn && (
          <>
            <div style={{ height: padding * 0.25 }} />
            <span
              style={{
                fontSize: clamp(W * 0.014, 11, 16),
                color: '#FFCA28',
                textAlign: 'center',
              }}
            >
              {t('combat.fairStart')}
            </span>
          </>
        )}
        <div style={{ height: padding * 0.75 }} />
        <button
          className="img-btn red"
          style={{
            width: clamp(W * 0.12, 100, 160),
            height: clamp(W * 0.04, 36, 52),
            fontSize: clamp(W * 0.018, 14, 22),
          }}
          onClick={isAI ? undefined : onReady}
        >
          {t('combat.ready')}
        </button>
      </div>
    </div>
  );
}
