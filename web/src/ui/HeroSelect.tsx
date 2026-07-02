import { useEffect, useState } from 'react';
import { ALL_HEROES, HeroType } from '../game/hero';
import { heroImage } from './assets';

// Replicates client/lib/screens/hero_selection_screen.dart (adventure mode):
// title pill with Player 1 badge, hero grid, details panel, Back/Start bar.
export function HeroSelect({
  onPick,
  onBack,
}: {
  onPick: (hero: HeroType) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<HeroType | null>(null);
  const [w, setW] = useState(window.innerWidth);

  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  // Flutter: titleWidth = (W*0.30).clamp(180,350); height = width*0.16
  const titleWidth = clamp(w * 0.3, 180, 350);
  const titleHeight = titleWidth * 0.16;
  const badgeWidth = titleWidth * 0.22;
  const badgeHeight = badgeWidth * 0.5;
  const titleFont = clamp(w * 0.016, 10, 16);

  const isWide = w > 800;
  const gridCols = w > 500 ? 3 : 2;
  const spacing = clamp(w * 0.01, 4, 12) * 0.8;
  const cardPadding = clamp(w * 0.01, 6, 12);
  const cardFont = clamp(w * 0.012, 10, 14);

  const panelPadding = clamp(w * 0.015, 10, 20);
  const heroNameSize = clamp(w * 0.022, 16, 28);
  const perkFontSize = clamp(w * 0.013, 11, 15);

  const buttonWidth = clamp(w * 0.14, 120, 180);
  const buttonHeight = clamp(w * 0.045, 40, 56);
  const btnFont = clamp(w * 0.014, 11, 16);
  const barPadding = clamp(w * 0.015, 12, 20);

  const selectedHero = ALL_HEROES.find((h) => h.type === selected) ?? null;

  const grid = (
    <div
      className="hs-grid"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gap: spacing,
      }}
    >
      {ALL_HEROES.map((hero) => (
        <button
          key={hero.type}
          className={`hs-card${selected === hero.type ? ' selected' : ''}`}
          onClick={() => setSelected(hero.type)}
        >
          <div className="hs-card-img" style={{ padding: cardPadding }}>
            <img src={heroImage(hero.imagePath)} alt={hero.name} />
          </div>
          <span style={{ fontSize: cardFont, paddingBottom: cardPadding }}>{hero.name}</span>
        </button>
      ))}
    </div>
  );

  const detailsPanel = (
    <div className="hs-details">
      {selectedHero ? (
        <>
          <div className="hs-details-img" style={{ padding: panelPadding }}>
            <img src={heroImage(selectedHero.imagePath)} alt={selectedHero.name} />
          </div>
          <div
            className="hs-details-name"
            style={{ fontSize: heroNameSize, paddingBottom: panelPadding * 0.5 }}
          >
            {selectedHero.name}
          </div>
        </>
      ) : (
        <span className="hs-placeholder" style={{ fontSize: perkFontSize }}>
          Select a hero
        </span>
      )}
    </div>
  );

  return (
    <div className="screen doodle-bg">
      {/* Title bar */}
      <div className="hs-titlebar">
        <div
          className="hs-title-pill"
          style={{ width: titleWidth, height: titleHeight }}
        >
          <div
            className="hs-player-badge"
            style={{ width: badgeWidth, height: badgeHeight }}
          >
            <span style={{ fontSize: titleFont * 0.6 }}>Player 1</span>
          </div>
          <span className="hs-title-text" style={{ fontSize: titleFont }}>
            Choose your hero
          </span>
        </div>
      </div>

      {/* Content */}
      {isWide ? (
        <div
          className="hs-content wide"
          style={{ padding: `8px ${w * 0.02}px` }}
        >
          <div style={{ width: w * 0.42, flexShrink: 0 }}>{grid}</div>
          <div style={{ width: w * 0.02, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}>{detailsPanel}</div>
        </div>
      ) : (
        <div
          className="hs-content narrow"
          style={{ padding: `8px ${w * 0.02}px` }}
        >
          {grid}
          <div style={{ height: 16 }} />
          <div style={{ height: '50vh' }}>{detailsPanel}</div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="hs-bottombar" style={{ padding: barPadding, gap: barPadding }}>
        <button
          className="img-btn grey"
          style={{ width: buttonWidth, height: buttonHeight, fontSize: btnFont * 0.9 }}
          onClick={onBack}
        >
          Back to menu
        </button>
        <button
          className="img-btn yellow"
          style={{
            width: buttonWidth * 1.1,
            height: buttonHeight,
            fontSize: btnFont,
            opacity: selectedHero ? 1 : 0.5,
          }}
          disabled={!selectedHero}
          onClick={() => selected && onPick(selected)}
        >
          Start
        </button>
      </div>
    </div>
  );
}
