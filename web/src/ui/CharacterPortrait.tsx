import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Character } from '../game/characters';
import { asset } from './assets';

/**
 * Character portrait with a CSS placeholder fallback: renders the portrait
 * image from its asset slot and, when the file does not exist yet, an
 * accent-colored tile with the character's initial. Final art drops into
 * public/assets/images/characters/{id}.png with no code change.
 */
export function CharacterPortrait({
  character,
  className,
  style,
  initialScale = 0.52,
}: {
  character: Character;
  className?: string;
  style?: CSSProperties;
  /** Initial letter size as a fraction of the tile (tune for small chips). */
  initialScale?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={className}
        role="img"
        aria-label={character.name}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '18%',
          background: `radial-gradient(circle at 30% 25%, ${character.accent}55, #131a2e 78%)`,
          border: `1.5px solid ${character.accent}`,
          boxShadow: `0 0 8px ${character.accent}66 inset`,
          color: character.accent,
          fontWeight: 800,
          containerType: 'size',
          ...style,
        }}
      >
        <span style={{ fontSize: `${initialScale * 100}cqmin`, lineHeight: 1 }}>
          {character.name.charAt(0)}
        </span>
      </div>
    );
  }
  return (
    <img
      className={className}
      style={style}
      src={asset(character.portrait)}
      alt={character.name}
      onError={() => setFailed(true)}
    />
  );
}
