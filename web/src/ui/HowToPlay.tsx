import { PERKS, SLOT3_POOL, SLOT4_POOL } from '../game/perks';
import { Icon } from './Icons';
import { CATEGORY_COLOR, perkIcon } from './perkTheme';

// How to Play: short kid-friendly rules plus the full power catalog,
// rendered straight from the perk definitions so it never drifts from
// what the combat screen offers.

const RULES = [
  'Every turn, one of your repair bots deploys onto a random data line all by itself.',
  'Then you pick one power — or pass and save your turn.',
  'Fill all 5 of your slots on a line to fix it.',
  'Fix 3 lines and you win the battle!',
  'Tap a power to read what it does before you use it.',
  'In the Campaign, powers come from the crew members you bring to the battle.',
];

const GROUPS: { title: string; ids: number[] }[] = [
  { title: 'Always available', ids: [1, 2] },
  { title: 'Protect powers', ids: SLOT3_POOL },
  { title: 'Action powers', ids: SLOT4_POOL },
];

export function HowToPlay({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen doodle-bg howto">
      <div className="overlay-header">
        <button className="chip" onClick={onBack}>
          <Icon name="arrowBack" size={20} color="#e8f4ff" />
          Menu
        </button>
        <span style={{ flex: 1 }} />
        <span className="chip">How to Play</span>
      </div>

      <div className="howto-scroll">
        <div className="howto-card">
          <h2 className="howto-heading">The Battle</h2>
          <ul className="howto-rules">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>

        {GROUPS.map((group) => (
          <div className="howto-card" key={group.title}>
            <h2 className="howto-heading">{group.title}</h2>
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
                  <span className="howto-perk-name">{perk.name}</span>
                  <span className="howto-perk-desc">{perk.description}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
