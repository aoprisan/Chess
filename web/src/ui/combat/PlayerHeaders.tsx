import { Character } from '../../game/characters';
import { CombatGameState, PlayerSide } from '../../game/state';
import { CharacterPortrait } from '../CharacterPortrait';
import { Icon } from '../Icons';
import { useT } from '../../i18n';
import { clamp } from './theme';

// --- Player headers ---------------------------------------------------------

export function PlayerHeaders({
  W,
  H,
  player1Team,
  player2Team,
  state,
}: {
  W: number;
  H: number;
  player1Team: Character[];
  player2Team: Character[];
  state: CombatGameState;
}) {
  const player1Hero = player1Team[0];
  const player2Hero = player2Team[0];
  const spacing = clamp(W * 0.008, 4, 10);
  const avatarW = clamp(W * 0.1, 50, 140);
  const avatarH = clamp(H * 0.1, 60, 160);
  const titleW = clamp(W * 0.14, 90, 160);
  const titleH = clamp(W * 0.05, 34, 52);
  const scoreW = clamp(W * 0.065, 45, 75);
  const fontSize = clamp(W * 0.018, 13, 20);

  const t = useT();
  const indicatorW = clamp(W * 0.08, 50, 90);
  const indicatorH = clamp(H * 0.1, 60, 160);
  const poleW = clamp(W * 0.005, 3, 6);
  const flagW = clamp(W * 0.04, 28, 50);
  const flagH = clamp(W * 0.05, 34, 60);
  const isP1Turn = state.currentPlayer === 'player1';

  const title = (side: PlayerSide, hero: Character) => (
    <div
      className={`pp-title ${side === 'player1' ? 'p1' : 'p2'}`}
      style={{
        width: titleW,
        height: titleH,
        fontSize,
        paddingLeft: side === 'player1' ? 8 : 0,
        paddingRight: side === 'player1' ? 0 : 8,
      }}
    >
      {hero.name}
    </div>
  );
  const score = (side: PlayerSide, value: number) => (
    <div
      className={`pp-score ${side === 'player1' ? 'p1' : 'p2'}`}
      style={{ width: scoreW, height: titleH, fontSize }}
    >
      {value}
    </div>
  );

  const teamColumn = (team: Character[]) => {
    const lead = team[0];
    const rest = team.slice(1);
    const chipSize = Math.max(14, avatarH * 0.22);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: avatarW,
          height: avatarH,
        }}
      >
        <CharacterPortrait
          character={lead}
          className="pp-avatar"
          style={{
            width: avatarW,
            height: rest.length > 0 ? avatarH - chipSize - 2 : avatarH,
            objectFit: 'contain',
          }}
        />
        {rest.length > 0 && (
          <div style={{ display: 'flex', gap: 2, height: chipSize }}>
            {rest.map((c) => (
              <CharacterPortrait
                key={c.id}
                character={c}
                style={{ width: chipSize, height: chipSize, objectFit: 'contain' }}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="player-headers" style={{ padding: `0 ${clamp(W * 0.02, 8, 20)}px` }}>
      <div className="player-panel p1">
        {teamColumn(player1Team)}
        <span style={{ width: spacing }} />
        {title('player1', player1Hero)}
        {score('player1', state.player1LanesWon)}
      </div>

      <div className="flag-indicator" style={{ width: indicatorW, height: indicatorH }}>
        <div
          className="flag-pole"
          style={{ top: indicatorH * 0.2, width: poleW, height: indicatorH * 0.8 }}
        />
        <div
          className={`flag-img ${isP1Turn ? 'p1' : 'p2'}`}
          role="img"
          aria-label={isP1Turn ? t('combat.p1turn') : t('combat.p2turn')}
          style={{
            top: indicatorH * 0.2,
            width: flagW,
            height: flagH,
            left: isP1Turn ? 0 : indicatorW - flagW,
            transform: isP1Turn ? 'scaleX(-1)' : undefined,
          }}
        >
          <Icon name="flash" size={flagW * 0.55} color="#0a0e1a" />
        </div>
      </div>

      <div className="player-panel p2">
        {score('player2', state.player2LanesWon)}
        {title('player2', player2Hero)}
        <span style={{ width: spacing }} />
        {teamColumn(player2Team)}
      </div>
    </div>
  );
}
