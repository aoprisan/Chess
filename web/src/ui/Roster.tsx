import { CHARACTERS } from '../game/characters';
import { CampaignController } from '../campaign/controller';
import { JOIN_THRESHOLD, WITHDRAW_THRESHOLD } from '../campaign/balance';
import { getPerk } from '../game/perks';
import { CharacterPortrait } from './CharacterPortrait';
import { Icon } from './Icons';
import { CATEGORY_COLOR, perkIcon } from './perkTheme';
import { useLang, useT, perkName, characterRole, characterTagline } from '../i18n';

// Crew roster: all 23 characters with respect progress toward joining
// (level 1) and withdrawing their defenses (level 2).
export function Roster({
  controller,
  onBack,
}: {
  controller: CampaignController;
  onBack: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  return (
    <div className="screen doodle-bg roster">
      <h1 className="ls-title">{t('roster.title')}</h1>
      <p className="ls-subtitle">
        {t('roster.subtitle', { join: JOIN_THRESHOLD, withdraw: WITHDRAW_THRESHOLD })}
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
                    {onCrew ? ` · ${characterRole(c, lang)}` : ` · ${t(`roster.map.${c.homeMap}`)}`}
                  </span>
                </span>
                {onCrew && <span className="roster-tagline">{characterTagline(c, lang)}</span>}
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
                      title={t('roster.joinsAt', { n: JOIN_THRESHOLD })}
                    />
                    <span
                      className="roster-bar-mark"
                      style={{ left: `${(WITHDRAW_THRESHOLD / barMax) * 100}%` }}
                      title={t('roster.withdrawsAt', { n: WITHDRAW_THRESHOLD })}
                    />
                  </div>
                )}
                <div className="roster-chips">
                  {starter ? (
                    <span className="roster-badge">{t('roster.badge.starter')}</span>
                  ) : (
                    <span className="roster-badge">
                      {level >= 2
                        ? t('roster.badge.withdrawn')
                        : level >= 1
                          ? t('roster.badge.joined')
                          : t('roster.badge.respect', { respect, join: JOIN_THRESHOLD })}
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
                          {perkName(p, lang)}
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
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
