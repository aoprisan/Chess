import { PERKS, SLOT3_POOL, SLOT4_POOL } from '../game/perks';
import { Icon } from './Icons';
import { CATEGORY_COLOR, perkIcon } from './perkTheme';
import { PerkPicto, PictoRow, PictoToken } from './PerkPicto';
import { useLang, useT, perkName, perkDescription } from '../i18n';

// How to Play: short kid-friendly rules plus the full power catalog,
// rendered straight from the perk definitions so it never drifts from
// what the combat screen offers. Copy is pulled from the i18n catalog.

const RULE_KEYS = [
  'howto.rule.1',
  'howto.rule.2',
  'howto.rule.3',
  'howto.rule.4',
  'howto.rule.5',
  'howto.rule.6',
];

const GROUPS: { titleKey: string; ids: number[] }[] = [
  { titleKey: 'howto.group.always', ids: [1, 2] },
  { titleKey: 'howto.group.protect', ids: SLOT3_POOL },
  { titleKey: 'howto.group.action', ids: SLOT4_POOL },
];

// The picture-chip grammar every power's pictogram is built from.
const LEGEND: { tokens: PictoToken[]; labelKey: string }[] = [
  { tokens: [{ tone: 'own', icon: 'robot' }], labelKey: 'howto.legend.ownBot' },
  { tokens: [{ tone: 'enemy', icon: 'robot' }], labelKey: 'howto.legend.enemyBot' },
  { tokens: [{ tone: 'gain', text: '+2' }], labelKey: 'howto.legend.gain' },
  { tokens: [{ tone: 'loss', text: '−2' }], labelKey: 'howto.legend.lose' },
  { tokens: [{ tone: 'time', icon: 'schedule' }], labelKey: 'howto.legend.next' },
  { tokens: [{ tone: 'neutral', icon: 'dice' }], labelKey: 'howto.legend.random' },
];

export function HowToPlay({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { lang } = useLang();
  return (
    <div className="screen doodle-bg howto">
      <div className="overlay-header">
        <button className="chip" onClick={onBack}>
          <Icon name="arrowBack" size={20} color="#e8f4ff" />
          {t('common.menu')}
        </button>
        <span style={{ flex: 1 }} />
        <span className="chip">{t('howto.chip')}</span>
      </div>

      <div className="howto-scroll">
        <div className="howto-card">
          <h2 className="howto-heading">{t('howto.battle')}</h2>
          <ul className="howto-rules">
            {RULE_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>

        <div className="howto-card">
          <h2 className="howto-heading">{t('howto.pictures')}</h2>
          {LEGEND.map((row) => (
            <div className="howto-legend-row" key={row.labelKey}>
              <PictoRow tokens={row.tokens} size={14} />
              <span className="howto-perk-desc">{t(row.labelKey)}</span>
            </div>
          ))}
        </div>

        {GROUPS.map((group) => (
          <div className="howto-card" key={group.titleKey}>
            <h2 className="howto-heading">{t(group.titleKey)}</h2>
            {group.ids.map((id) => {
              const perk = PERKS[id];
              return (
                <div className="howto-perk" key={id}>
                  <span
                    className="howto-perk-icon"
                    style={{ background: CATEGORY_COLOR[perk.category] }}
                  >
                    <Icon name={perkIcon(id)} size={16} color="#fff" />
                  </span>
                  <span className="howto-perk-name">{perkName(perk, lang)}</span>
                  <span className="howto-perk-info">
                    <PerkPicto perkId={id} size={13} />
                    <span className="howto-perk-desc">{perkDescription(perk, lang)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
