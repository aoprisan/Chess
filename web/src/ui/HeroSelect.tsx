import { useState } from 'react';
import { ALL_HEROES, HeroType } from '../game/hero';
import { heroImage } from './assets';

export function HeroSelect({
  onPick,
  onBack,
}: {
  onPick: (hero: HeroType) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<HeroType | null>(null);

  return (
    <div className="screen home" style={{ justifyContent: 'flex-start', paddingTop: 8 }}>
      <div className="header-row" style={{ width: '100%' }}>
        <button className="chip" onClick={onBack}>← Menu</button>
        <span className="title">Choose your Hero</span>
        <span style={{ width: 60 }} />
      </div>

      <div className="hero-grid">
        {ALL_HEROES.map((hero) => (
          <button
            key={hero.type}
            className={`hero-card${selected === hero.type ? ' selected' : ''}`}
            onClick={() => setSelected(hero.type)}
          >
            <img src={heroImage(hero.imagePath)} alt={hero.name} />
            <span>{hero.name}</span>
          </button>
        ))}
      </div>

      <button className="btn" disabled={selected === null} onClick={() => selected && onPick(selected)}>
        ▶ Begin Adventure
      </button>
    </div>
  );
}
