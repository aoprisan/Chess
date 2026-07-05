import { CHARACTERS } from '../game/characters';
import { CampaignController } from '../campaign/controller';
import { JOIN_THRESHOLD, WITHDRAW_THRESHOLD } from '../campaign/balance';
import { getPerk } from '../game/perks';
import { CharacterPortrait } from './CharacterPortrait';
import { Icon } from './Icons';
import { CATEGORY_COLOR, perkIcon } from './perkTheme';

const MAP_LABELS: Record<number, string> = {
  0: 'Starter',
  1: 'Street Grid',
  2: 'Metro Net',
  3: 'Sky Core',
};

// Crew roster: all 23 characters with respect progress toward joining
// (level 1) and withdrawing their defenses (level 2).
export function Roster({
  controller,
  onBack,
}: {
  controller: CampaignController;
  onBack: () => void;
}) {
  return (
    <div className="screen doodle-bg roster">
      <h1 className="ls-title">Your Crew</h1>
      <p className="ls-subtitle">
        Beat a character&apos;s systems to earn respect. {JOIN_THRESHOLD}+ and they join you;{' '}
        {WITHDRAW_THRESHOLD}+ and they pull their defenses off the whole city!
      </p>
      <div className="roster-list">
        {CHARACTERS.map((c) => {
          const starter = c.homeMap === 0;
          const level = controller.respectLevel(c.id);
          const onCrew = controller.isOnCrew(c.id);
          const respect = starter ? 0 : controller.respectFor(c.id);
          const max = starter ? 0 : controller.maxRespectFor(c.id);
          const barMax = Math.max(WITHDRAW_THRESHOLD, Math.min(max, WITHDRAW_THRESHOLD + 3));
          return (
            <div key={c.id} className={`roster-card${onCrew ? '' : ' unmet'}`}>
              <CharacterPortrait
                character={c}
                className="roster-portrait"
                style={{
                  width: 56,
                  height: 56,
                  objectFit: 'contain',
                  filter: onCrew ? undefined : 'grayscale(1) brightness(0.55)',
                }}
              />
              <div className="roster-info">
                <span className="roster-name">
                  {onCrew ? c.name : '???'}
                  <span className="roster-role">
                    {onCrew ? ` · ${c.role}` : ` · ${MAP_LABELS[c.homeMap]}`}
                  </span>
                </span>
                {onCrew && <span className="roster-tagline">{c.tagline}</span>}
                {!starter && (
                  <div className="roster-bar">
                    <div
                      className="roster-bar-fill"
                      style={{
                        width: `${Math.min(100, (respect / barMax) * 100)}%`,
                        background: level >= 2 ? '#3dff8f' : c.accent,
                      }}
                    />
                    <span
                      className="roster-bar-mark"
                      style={{ left: `${(JOIN_THRESHOLD / barMax) * 100}%` }}
                      title={`Joins at ${JOIN_THRESHOLD}`}
                    />
                    <span
                      className="roster-bar-mark"
                      style={{ left: `${(WITHDRAW_THRESHOLD / barMax) * 100}%` }}
                      title={`Withdraws at ${WITHDRAW_THRESHOLD}`}
                    />
                  </div>
                )}
                <div className="roster-chips">
                  {starter ? (
                    <span className="roster-badge">On your crew from day one</span>
                  ) : (
                    <span className="roster-badge">
                      {level >= 2
                        ? 'Defenses withdrawn!'
                        : level >= 1
                          ? 'On your crew'
                          : `Respect ${respect}/${JOIN_THRESHOLD} to join`}
                    </span>
                  )}
                  {onCrew &&
                    c.perkIds.map((perkId) => {
                      const p = getPerk(perkId);
                      if (!p) return null;
                      return (
                        <span
                          key={perkId}
                          className="chip"
                          style={{
                            borderColor: CATEGORY_COLOR[p.category],
                            color: CATEGORY_COLOR[p.category],
                          }}
                          title={p.description}
                        >
                          <Icon name={perkIcon(perkId)} size={12} color={CATEGORY_COLOR[p.category]} />
                          {p.name}
                        </span>
                      );
                    })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ls-bottombar">
        <button className="img-btn grey" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
