import { Icon, IconName } from './Icons';

// Pictogram phrases: every perk gets a short row of colored picture-chips
// that tells its story without words, for the pre-readers in the 8-11
// target group. The grammar is small and repeats everywhere:
//   cyan robot = your bot, magenta robot = enemy bot, +N/−N = gain/lose,
//   clock = happens next turn, dice = random, → = turns into.

export type PictoTone = 'own' | 'enemy' | 'gain' | 'loss' | 'time' | 'neutral';

export interface PictoToken {
  tone: PictoTone;
  icon?: IconName;
  text?: string;
}

export const PICTO_TONE_COLOR: Record<PictoTone, string> = {
  own: '#00e5ff',
  enemy: '#ff2fd6',
  gain: '#3dff8f',
  loss: '#ff5577',
  time: '#ffd23f',
  neutral: '#8899bb',
};

const t = (tone: PictoTone, icon?: IconName, text?: string): PictoToken => ({ tone, icon, text });
const you = (text?: string) => t('own', 'robot', text);
const foe = (text?: string) => t('enemy', 'robot', text);
const gain = (text: string) => t('gain', undefined, text);
const later = t('time', 'schedule');
const arrow = t('neutral', undefined, '→');
const random = t('neutral', 'dice');

/** The pictogram phrase for each perk (perkTheme.test.ts enforces coverage). */
export const PERK_PICTO: Record<number, PictoToken[]> = {
  0: [t('neutral', 'skip')], // Pass
  1: [you('+1')], // Deploy Bot
  2: [t('own', 'flash'), foe('−1')], // Debug Zap
  // Slot 3: React & Protect
  4: [t('own', 'snowflake'), foe('✕'), t('time', 'schedule', '1')], // Lockdown
  22: [t('own', 'eyeOff'), t('time', 'schedule', '2')], // Stealth Mode
  24: [t('own', 'portal'), foe(), t('neutral', 'shuffle')], // Warp Gate
  25: [t('own', 'bug'), foe('−1')], // Honeypot
  26: [you('+1'), t('time', 'copy'), gain('+2')], // Copycat
  27: [you('+1'), t('time', 'surround'), gain('+2'), random], // Ping Echo
  28: [you('+1'), t('time', 'boltCircle'), foe('−2')], // Power Surge
  29: [you('−1'), later, gain('+2')], // Duplicator
  30: [you('−1'), later, foe('−2')], // Short Circuit
  46: [you('−1'), later, gain('+1')], // Cloud Backup
  33: [you(), t('neutral', 'swap'), you()], // Reroute
  35: [you(), t('neutral', 'shuffle')], // Scatter
  43: [you('+1'), later, t('own', 'swap', '+1')], // Beacon
  49: [t('own', 'heart'), t('time', 'schedule', '2')], // Safe Zone
  52: [you('+1'), later, t('enemy', 'search')], // Bounce Back
  // Slot 4: Act & Disrupt
  13: [foe(), t('neutral', 'sync')], // Scramble
  23: [t('enemy', 'noise'), t('time', 'schedule', '2')], // Static Storm
  31: [you('−1'), arrow, gain('+2')], // Split
  32: [you('−1'), arrow, foe('−2')], // Overload
  34: [foe(), t('neutral', 'swap'), foe()], // Crosswire
  36: [foe(), t('neutral', 'shuffle')], // Disperse
  37: [foe('+3'), you('+2')], // Gambit
  38: [foe('−1'), you('+1')], // Data Grab
  39: [you('+2'), foe('+2'), t('loss', undefined, '−1')], // Rush
  40: [you('+1'), later, t('enemy', 'personAdd'), arrow, you()], // Recruit
  41: [you('+1'), later, foe('−1')], // Ambush
  42: [you('+1'), later, gain('+1')], // Reinforce
  50: [t('own', 'magnet'), foe(), arrow, you()], // Magnet
  51: [t('enemy', 'search'), later, random], // Probe
  48: [t('own', 'shieldCheck'), t('loss', 'bug', '✕')], // Firewall
};

/** A row of picture-chips for arbitrary tokens (legend, tutorial). */
export function PictoRow({ tokens, size = 12 }: { tokens: PictoToken[]; size?: number }) {
  return (
    <span className="picto-row" aria-hidden>
      {tokens.map((tok, i) => {
        const color = PICTO_TONE_COLOR[tok.tone];
        if (!tok.icon && tok.text === '→') {
          return (
            <span key={i} className="picto-arrow" style={{ fontSize: size }}>
              →
            </span>
          );
        }
        return (
          <span
            key={i}
            className="picto-chip"
            style={{ borderColor: color, color, background: `${color}1f`, fontSize: size * 0.85 }}
          >
            {tok.icon && <Icon name={tok.icon} size={size} color={color} />}
            {tok.text}
          </span>
        );
      })}
    </span>
  );
}

/** The perk's pictogram phrase as a row of picture-chips. */
export function PerkPicto({ perkId, size = 12 }: { perkId: number; size?: number }) {
  const tokens = PERK_PICTO[perkId];
  if (!tokens) return null;
  return <PictoRow tokens={tokens} size={size} />;
}
