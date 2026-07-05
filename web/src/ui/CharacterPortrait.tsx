import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Character } from '../game/characters';
import { BotAvatar } from './BotAvatar';
import { asset } from './assets';

/**
 * Character portrait: renders the portrait image from its asset slot and,
 * when the file does not exist yet, the procedural neon avatar (BotAvatar).
 * Final art drops into public/assets/images/characters/{id}.png with no
 * code change; Gemini prompts for each portrait live in
 * art-prompts/characters/.
 */
export function CharacterPortrait({
  character,
  className,
  style,
}: {
  character: Character;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <BotAvatar character={character} className={className} style={style} />;
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
