import { useEffect, useState } from 'react';
import { Character, CharacterId, characterById } from '../game/characters';
import { crewIds } from '../campaign/meta';
import { getPerk } from '../game/perks';
import { CharacterPortrait } from './CharacterPortrait';
import { CATEGORY_COLOR } from './perkTheme';

export const AI_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type AIDifficulty = (typeof AI_DIFFICULTIES)[number];

const DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

// Character picker for Quick Match and 2 Players: title pill with player
// badge, crew grid, details panel with role/tagline/perks, Back/Start bar.
// Quick Match also passes difficulty/onDifficultyChange for the AI chips.
export function CharacterSelect({
  roster,
  onPick,
  onBack,
  playerLabel = 'Player 1',
  backLabel = 'Back to menu',
  difficulty,
  onDifficultyChange,
}: {
  /** Selectable characters (the crew); defaults to the saved crew. */
  roster?: CharacterId[];
  onPick: (id: CharacterId) => void;
  onBack: () => void;
  playerLabel?: string;
  backLabel?: string;
  difficulty?: AIDifficulty;
  onDifficultyChange?: (difficulty: AIDifficulty) => void;
}) {
  const characters: Character[] = (roster ?? crewIds()).map(characterById);
  const [selected, setSelected] = useState<CharacterId | null>(null);
  const [w, setW] = useState(window.innerWidth);

  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
  const nameSize = clamp(w * 0.022, 16, 28);
  const perkFontSize = clamp(w * 0.013, 11, 15);

  const buttonWidth = clamp(w * 0.14, 120, 180);
  const buttonHeight = clamp(w * 0.045, 40, 56);
  const btnFont = clamp(w * 0.014, 11, 16);
  const barPadding = clamp(w * 0.015, 12, 20);

  const selectedChar = characters.find((c) => c.id === selected) ?? null;

  const grid = (
    <div
      className="hs-grid"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gap: spacing,
      }}
    >
      {characters.map((c) => (
        <button
          key={c.id}
          className={`hs-card${selected === c.id ? ' selected' : ''}`}
          onClick={() => setSelected(c.id)}
        >
          <div className="hs-card-img" style={{ padding: cardPadding }}>
            <CharacterPortrait character={c} style={{ width: '100%', height: '100%' }} />
          </div>
          <span style={{ fontSize: cardFont, paddingBottom: cardPadding }}>{c.name}</span>
        </button>
      ))}
    </div>
  );

  const detailsPanel = (
    <div className="hs-details">
      {selectedChar ? (
        <>
          <div className="hs-details-img" style={{ padding: panelPadding }}>
            <CharacterPortrait
              character={selectedChar}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div
            className="hs-details-name"
            style={{ fontSize: nameSize, paddingBottom: panelPadding * 0.25 }}
          >
            {selectedChar.name}
          </div>
          <div
            style={{
              fontSize: perkFontSize,
              opacity: 0.8,
              paddingBottom: panelPadding * 0.4,
              textAlign: 'center',
            }}
          >
            {selectedChar.role} — {selectedChar.tagline}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              justifyContent: 'center',
              paddingBottom: panelPadding * 0.5,
            }}
          >
            {selectedChar.perkIds.map((perkId) => {
              const perk = getPerk(perkId);
              if (!perk) return null;
              return (
                <span
                  key={perkId}
                  className="chip"
                  style={{
                    fontSize: perkFontSize * 0.9,
                    border: `1px solid ${CATEGORY_COLOR[perk.category]}`,
                    color: CATEGORY_COLOR[perk.category],
                  }}
                  title={perk.description}
                >
                  {perk.name}
                </span>
              );
            })}
          </div>
        </>
      ) : (
        <span className="hs-placeholder" style={{ fontSize: perkFontSize }}>
          Select a character
        </span>
      )}
    </div>
  );

  return (
    <div className="screen doodle-bg">
      {/* Title bar */}
      <div className="hs-titlebar">
        <div className="hs-title-pill" style={{ width: titleWidth, height: titleHeight }}>
          <div className="hs-player-badge" style={{ width: badgeWidth, height: badgeHeight }}>
            <span style={{ fontSize: titleFont * 0.6 }}>{playerLabel}</span>
          </div>
          <span className="hs-title-text" style={{ fontSize: titleFont }}>
            Choose your character
          </span>
        </div>
      </div>

      {/* Content */}
      {isWide ? (
        <div className="hs-content wide" style={{ padding: `8px ${w * 0.02}px` }}>
          <div style={{ width: w * 0.42, flexShrink: 0 }}>{grid}</div>
          <div style={{ width: w * 0.02, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}>{detailsPanel}</div>
        </div>
      ) : (
        <div className="hs-content narrow" style={{ padding: `8px ${w * 0.02}px` }}>
          {grid}
          <div style={{ height: 16 }} />
          <div style={{ height: '50vh' }}>{detailsPanel}</div>
        </div>
      )}

      {/* Difficulty chips (Quick Match only) */}
      {difficulty && onDifficultyChange && (
        <div className="hs-difficulty" role="radiogroup" aria-label="Rival difficulty">
          {AI_DIFFICULTIES.map((d) => (
            <button
              key={d}
              className={`chip selectable${difficulty === d ? ' selected' : ''}`}
              role="radio"
              aria-checked={difficulty === d}
              onClick={() => onDifficultyChange(d)}
            >
              {DIFFICULTY_LABELS[d]}
            </button>
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div className="hs-bottombar" style={{ padding: barPadding, gap: barPadding }}>
        <button
          className="img-btn grey"
          style={{ width: buttonWidth, height: buttonHeight, fontSize: btnFont * 0.9 }}
          onClick={onBack}
        >
          {backLabel}
        </button>
        <button
          className="img-btn yellow"
          style={{
            width: buttonWidth * 1.1,
            height: buttonHeight,
            fontSize: btnFont,
            opacity: selectedChar ? 1 : 0.5,
          }}
          disabled={!selectedChar}
          onClick={() => selected && onPick(selected)}
        >
          Start
        </button>
      </div>
    </div>
  );
}
