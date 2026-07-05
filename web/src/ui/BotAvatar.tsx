import { useId } from 'react';
import type { CSSProperties } from 'react';
import { Character } from '../game/characters';

// Procedural neon portrait for every Fixer: a hand-tuned mix of head, eyes,
// antenna, and mouth per character (LOOKS below), drawn as pure SVG in the
// character's accent color over a circuit-board backdrop. No filters — the
// glow is layered strokes — so a roster full of 23 avatars stays cheap.
// Real PNG art still wins: CharacterPortrait only renders this when the
// portrait asset slot is empty.

type Head = 'round' | 'square' | 'hex' | 'dome' | 'tall';
type Eyes = 'visor' | 'round' | 'goggles' | 'mono' | 'calm' | 'star';
type Antenna = 'bolt' | 'twin' | 'loop' | 'fin' | 'pods' | 'none';
type Mouth = 'smile' | 'grill' | 'zigzag' | 'open' | 'wave';

interface Look {
  head: Head;
  eyes: Eyes;
  antenna: Antenna;
  mouth: Mouth;
}

// One distinct combination per Fixer, loosely matched to their role
// (Sparky the Power Tech gets the lightning bolt, Momo the Safety Officer
// gets the helmet dome, Reverb the Echo Engineer gets headphone pods...).
const LOOKS: Record<string, Look> = {
  // Starters
  bitzy: { head: 'square', eyes: 'visor', antenna: 'twin', mouth: 'smile' },
  pixel: { head: 'round', eyes: 'star', antenna: 'loop', mouth: 'smile' },
  cache: { head: 'tall', eyes: 'goggles', antenna: 'twin', mouth: 'smile' },
  sparky: { head: 'round', eyes: 'round', antenna: 'bolt', mouth: 'zigzag' },
  momo: { head: 'dome', eyes: 'round', antenna: 'none', mouth: 'smile' },
  // Map 1: Street Grid
  popcorn: { head: 'round', eyes: 'round', antenna: 'loop', mouth: 'open' },
  reverb: { head: 'square', eyes: 'goggles', antenna: 'pods', mouth: 'wave' },
  forky: { head: 'tall', eyes: 'round', antenna: 'twin', mouth: 'open' },
  swipe: { head: 'dome', eyes: 'visor', antenna: 'fin', mouth: 'smile' },
  scatterbug: { head: 'round', eyes: 'calm', antenna: 'pods', mouth: 'zigzag' },
  recruta: { head: 'square', eyes: 'round', antenna: 'loop', mouth: 'open' },
  // Map 2: Metro Net
  static: { head: 'dome', eyes: 'visor', antenna: 'none', mouth: 'wave' },
  warp: { head: 'hex', eyes: 'mono', antenna: 'twin', mouth: 'grill' },
  twinsy: { head: 'square', eyes: 'round', antenna: 'twin', mouth: 'smile' },
  sparkplug: { head: 'hex', eyes: 'goggles', antenna: 'bolt', mouth: 'grill' },
  beacon: { head: 'tall', eyes: 'mono', antenna: 'loop', mouth: 'smile' },
  shuffle: { head: 'round', eyes: 'calm', antenna: 'fin', mouth: 'wave' },
  // Map 3: Sky Core
  vex: { head: 'hex', eyes: 'visor', antenna: 'bolt', mouth: 'zigzag' },
  sponge: { head: 'round', eyes: 'round', antenna: 'none', mouth: 'open' },
  payback: { head: 'square', eyes: 'visor', antenna: 'fin', mouth: 'grill' },
  gamba: { head: 'dome', eyes: 'calm', antenna: 'loop', mouth: 'smile' },
  magnet: { head: 'hex', eyes: 'round', antenna: 'pods', mouth: 'smile' },
  nullo: { head: 'square', eyes: 'mono', antenna: 'none', mouth: 'grill' },
};

const FALLBACK_LOOK: Look = { head: 'round', eyes: 'round', antenna: 'twin', mouth: 'smile' };

function HeadShape({ head, accent }: { head: Head; accent: string }) {
  const common = {
    fill: '#111a30',
    stroke: accent,
    strokeWidth: 2.5,
  };
  switch (head) {
    case 'round':
      return <rect x={26} y={24} width={48} height={44} rx={22} {...common} />;
    case 'square':
      return <rect x={27} y={25} width={46} height={42} rx={9} {...common} />;
    case 'hex':
      return <polygon points="50,21 74,33 74,57 50,69 26,57 26,33" {...common} />;
    case 'dome':
      return <path d="M28 67 V46 A22 22 0 0 1 72 46 V67 Z" {...common} />;
    case 'tall':
      return <rect x={31} y={19} width={38} height={49} rx={13} {...common} />;
  }
}

function EyesShape({ eyes, accent }: { eyes: Eyes; accent: string }) {
  switch (eyes) {
    case 'visor':
      return (
        <g>
          <rect x={33} y={38} width={34} height={11} rx={5.5} fill={accent} opacity={0.28} />
          <rect x={35} y={40} width={30} height={7} rx={3.5} fill={accent} />
          <rect x={38} y={41.5} width={8} height={2} rx={1} fill="#fff" opacity={0.85} />
        </g>
      );
    case 'round':
      return (
        <g>
          <circle cx={40} cy={44} r={8} fill={accent} opacity={0.25} />
          <circle cx={60} cy={44} r={8} fill={accent} opacity={0.25} />
          <circle cx={40} cy={44} r={5.5} fill={accent} />
          <circle cx={60} cy={44} r={5.5} fill={accent} />
          <circle cx={41.5} cy={42.5} r={1.8} fill="#fff" />
          <circle cx={61.5} cy={42.5} r={1.8} fill="#fff" />
        </g>
      );
    case 'goggles':
      return (
        <g>
          <line x1={46} y1={44} x2={54} y2={44} stroke={accent} strokeWidth={2.5} />
          <circle cx={39} cy={44} r={7.5} fill="#0a0f1c" stroke={accent} strokeWidth={2.5} />
          <circle cx={61} cy={44} r={7.5} fill="#0a0f1c" stroke={accent} strokeWidth={2.5} />
          <circle cx={39} cy={44} r={2.8} fill={accent} />
          <circle cx={61} cy={44} r={2.8} fill={accent} />
        </g>
      );
    case 'mono':
      return (
        <g>
          <circle cx={50} cy={43} r={9.5} fill={accent} opacity={0.25} />
          <circle cx={50} cy={43} r={7} fill="#0a0f1c" stroke={accent} strokeWidth={2.5} />
          <circle cx={50} cy={43} r={3} fill={accent} />
          <circle cx={51.5} cy={41.5} r={1.2} fill="#fff" />
        </g>
      );
    case 'calm':
      return (
        <g>
          <rect x={33} y={41} width={13} height={5.5} rx={2.75} fill={accent} />
          <rect x={54} y={41} width={13} height={5.5} rx={2.75} fill={accent} />
        </g>
      );
    case 'star':
      return (
        <g fill={accent}>
          <path d="M40 37 L42 42 L47 44 L42 46 L40 51 L38 46 L33 44 L38 42 Z" />
          <path d="M60 37 L62 42 L67 44 L62 46 L60 51 L58 46 L53 44 L58 42 Z" />
        </g>
      );
  }
}

function MouthShape({ mouth, accent }: { mouth: Mouth; accent: string }) {
  const stroke = {
    fill: 'none',
    stroke: accent,
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (mouth) {
    case 'smile':
      return <path d="M42 56 Q50 62 58 56" {...stroke} />;
    case 'grill':
      return (
        <g fill={accent}>
          <rect x={43} y={54} width={3} height={8} rx={1.5} />
          <rect x={48.5} y={54} width={3} height={8} rx={1.5} />
          <rect x={54} y={54} width={3} height={8} rx={1.5} />
        </g>
      );
    case 'zigzag':
      return <path d="M40 58 L45 54 L50 58 L55 54 L60 58" {...stroke} />;
    case 'open':
      return <path d="M43 55 Q50 64 57 55 Z" fill={accent} opacity={0.9} />;
    case 'wave':
      return <path d="M40 57 Q45 53 50 57 T60 57" {...stroke} />;
  }
}

function AntennaShape({ antenna, accent }: { antenna: Antenna; accent: string }) {
  const stroke = { stroke: accent, strokeWidth: 2.5, strokeLinecap: 'round' as const };
  switch (antenna) {
    case 'bolt':
      return <polygon points="54,4 44,17 50,17 46,28 58,13 51,13" fill={accent} />;
    case 'twin':
      return (
        <g>
          <line x1={38} y1={25} x2={35} y2={13} {...stroke} />
          <line x1={62} y1={25} x2={65} y2={13} {...stroke} />
          <circle cx={35} cy={11} r={3} fill={accent} />
          <circle cx={65} cy={11} r={3} fill={accent} />
        </g>
      );
    case 'loop':
      return (
        <g>
          <line x1={50} y1={24} x2={50} y2={17} {...stroke} />
          <circle cx={50} cy={11.5} r={5} fill="none" stroke={accent} strokeWidth={2.5} />
        </g>
      );
    case 'fin':
      return <polygon points="44,24 50,7 56,24" fill={accent} opacity={0.9} />;
    case 'pods':
      return (
        <g fill="#111a30" stroke={accent} strokeWidth={2.5}>
          <rect x={16} y={38} width={9} height={17} rx={4.5} />
          <rect x={75} y={38} width={9} height={17} rx={4.5} />
        </g>
      );
    case 'none':
      return null;
  }
}

export function BotAvatar({
  character,
  className,
  style,
}: {
  character: Character;
  className?: string;
  style?: CSSProperties;
}) {
  const uid = useId();
  const gradientId = `av${uid}`;
  const accent = character.accent;
  const look = LOOKS[character.id] ?? FALLBACK_LOOK;
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={character.name}
      className={className}
      style={{ display: 'block', ...style }}
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="32%" r="75%">
          <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
          <stop offset="55%" stopColor="#131a2e" stopOpacity={1} />
          <stop offset="100%" stopColor="#0a0f1c" stopOpacity={1} />
        </radialGradient>
      </defs>
      {/* Backdrop tile with circuit traces */}
      <rect x={1.5} y={1.5} width={97} height={97} rx={18} fill={`url(#${gradientId})`} />
      <g stroke={accent} strokeWidth={1.5} fill="none" opacity={0.3}>
        <polyline points="6,24 16,24 22,30 22,42" />
        <polyline points="94,70 84,70 78,64 78,52" />
        <polyline points="10,82 20,82 26,76" />
      </g>
      <g fill={accent} opacity={0.45}>
        <circle cx={22} cy={44} r={1.8} />
        <circle cx={78} cy={50} r={1.8} />
        <circle cx={28} cy={74} r={1.8} />
      </g>
      {/* Shoulders + neck */}
      <rect x={44} y={64} width={12} height={12} fill="#111a30" stroke={accent} strokeWidth={2} />
      <rect
        x={22}
        y={74}
        width={56}
        height={22}
        rx={9}
        fill="#111a30"
        stroke={accent}
        strokeWidth={2.5}
      />
      <line x1={50} y1={78} x2={50} y2={86} stroke={accent} strokeWidth={2} opacity={0.5} />
      {/* The bot */}
      <AntennaShape antenna={look.antenna} accent={accent} />
      <HeadShape head={look.head} accent={accent} />
      <EyesShape eyes={look.eyes} accent={accent} />
      <MouthShape mouth={look.mouth} accent={accent} />
      {/* Cheek lights */}
      <circle cx={34} cy={52} r={1.8} fill={accent} opacity={0.5} />
      <circle cx={66} cy={52} r={1.8} fill={accent} opacity={0.5} />
      {/* Tile frame */}
      <rect
        x={1.5}
        y={1.5}
        width={97}
        height={97}
        rx={18}
        fill="none"
        stroke={accent}
        strokeWidth={2.5}
        opacity={0.9}
      />
    </svg>
  );
}
