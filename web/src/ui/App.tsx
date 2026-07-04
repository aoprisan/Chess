import { useEffect, useRef, useState } from 'react';
import { CHARACTERS, CharacterId, characterById } from '../game/characters';
import { CampaignMapDef, CampaignMapId, loadAllCampaignMaps } from '../campaign/model';
import { CampaignController } from '../campaign/controller';
import { BASE_URL } from './assets';
import { preloadGameImages } from './preload';
import { AI_DIFFICULTIES, AIDifficulty, CharacterSelect } from './CharacterSelect';
import { CampaignMap } from './CampaignMap';
import { MapSelect } from './MapSelect';
import { Roster } from './Roster';
import { HowToPlay } from './HowToPlay';
import { Combat } from './Combat';

type View =
  | { name: 'home' }
  | { name: 'howto' }
  // Campaign
  | { name: 'mapSelect' }
  | { name: 'roster' }
  | { name: 'campaign'; mapId: CampaignMapId }
  // Standalone battles (outside the campaign)
  | { name: 'quickCharSelect' }
  | { name: 'duelCharSelect'; p1?: CharacterId }
  | { name: 'battle'; p1: CharacterId; p2: CharacterId; vsAI: boolean; difficulty: AIDifficulty };

/** Rival for a quick match: any character other than the player's pick. */
function randomRival(p1: CharacterId): CharacterId {
  const others = CHARACTERS.filter((c) => c.id !== p1);
  return others[Math.floor(Math.random() * others.length)].id;
}

const SOLO_DIFFICULTY_KEY = 'solo_difficulty_v1';

function loadSoloDifficulty(): AIDifficulty {
  try {
    const stored = localStorage.getItem(SOLO_DIFFICULTY_KEY);
    if (stored && (AI_DIFFICULTIES as readonly string[]).includes(stored)) {
      return stored as AIDifficulty;
    }
  } catch {
    // localStorage unavailable (private mode etc.) — fall back to default.
  }
  return 'medium';
}

function saveSoloDifficulty(difficulty: AIDifficulty) {
  try {
    localStorage.setItem(SOLO_DIFFICULTY_KEY, difficulty);
  } catch {
    // Persisting is best-effort.
  }
}

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [soloDifficulty, setSoloDifficulty] = useState<AIDifficulty>(loadSoloDifficulty);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Game art loads up front behind a progress bar so no screen paints with
  // half-loaded images; the three campaign map JSONs ride along (they are
  // tiny and the controller needs all of them for cross-map withdrawal).
  const [assetProgress, setAssetProgress] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const controllerRef = useRef<CampaignController | null>(null);

  useEffect(() => {
    let stale = false;
    const images = preloadGameImages((fraction) => {
      if (!stale) setAssetProgress(fraction);
    });
    const maps = loadAllCampaignMaps(BASE_URL);
    Promise.all([images, maps])
      .then(([, loadedMaps]: [unknown, Record<CampaignMapId, CampaignMapDef>]) => {
        if (stale) return;
        controllerRef.current = new CampaignController(loadedMaps);
        setAssetsReady(true);
      })
      .catch((e) => !stale && setLoadError(String(e)));
    return () => {
      stale = true;
    };
  }, []);

  const controller = controllerRef.current;

  if (loadError) {
    return (
      <div className="app screen doodle-bg menu-home">
        <h1 className="menu-error">Oops!</h1>
        <p className="menu-error-detail">Could not load Neon City.</p>
        <p className="menu-error-detail" style={{ fontSize: 12 }}>
          {loadError}
        </p>
      </div>
    );
  }

  if (!assetsReady || !controller) {
    const percent = Math.round(assetProgress * 100);
    return (
      <div className="app screen menu-home boot-screen">
        <h1 className="boot-title neon-title">NEON CITY</h1>
        <div className="boot-bar">
          <div className="boot-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="boot-label">Booting… {percent}%</p>
      </div>
    );
  }

  if (view.name === 'howto') {
    return (
      <div className="app">
        <HowToPlay onBack={() => setView({ name: 'home' })} />
      </div>
    );
  }

  if (view.name === 'mapSelect') {
    return (
      <div className="app">
        <MapSelect
          controller={controller}
          onBack={() => setView({ name: 'home' })}
          onRoster={() => setView({ name: 'roster' })}
          onPick={(mapId) => setView({ name: 'campaign', mapId })}
        />
      </div>
    );
  }

  if (view.name === 'roster') {
    return (
      <div className="app">
        <Roster controller={controller} onBack={() => setView({ name: 'mapSelect' })} />
      </div>
    );
  }

  if (view.name === 'campaign') {
    return (
      <div className="app">
        <CampaignMap
          key={view.mapId}
          controller={controller}
          mapId={view.mapId}
          onExit={() => setView({ name: 'mapSelect' })}
          onOpenMap={(mapId) => setView({ name: 'campaign', mapId })}
        />
      </div>
    );
  }

  // Quick Match: pick your character and rival difficulty, then fight.
  if (view.name === 'quickCharSelect') {
    return (
      <div className="app">
        <CharacterSelect
          onBack={() => setView({ name: 'home' })}
          difficulty={soloDifficulty}
          onDifficultyChange={(d) => {
            setSoloDifficulty(d);
            saveSoloDifficulty(d);
          }}
          onPick={(id) =>
            setView({
              name: 'battle',
              p1: id,
              p2: randomRival(id),
              vsAI: true,
              difficulty: soloDifficulty,
            })
          }
        />
      </div>
    );
  }

  // 2 Players (same device): each player picks a character, then pass-and-play.
  if (view.name === 'duelCharSelect') {
    const pickingP1 = view.p1 === undefined;
    return (
      <div className="app">
        <CharacterSelect
          key={pickingP1 ? 'p1' : 'p2'}
          playerLabel={pickingP1 ? 'Player 1' : 'Player 2'}
          backLabel={pickingP1 ? 'Back to menu' : 'Back'}
          onBack={() => setView(pickingP1 ? { name: 'home' } : { name: 'duelCharSelect' })}
          onPick={(id) =>
            pickingP1
              ? setView({ name: 'duelCharSelect', p1: id })
              : setView({
                  name: 'battle',
                  p1: view.p1!,
                  p2: id,
                  vsAI: false,
                  difficulty: 'medium',
                })
          }
        />
      </div>
    );
  }

  if (view.name === 'battle') {
    return (
      <div className="app">
        <Combat
          key={`${view.p1}-${view.p2}-${view.vsAI}-${view.difficulty}`}
          player1Team={[characterById(view.p1)]}
          player2Team={[characterById(view.p2)]}
          aiDifficulty={view.difficulty}
          player2IsAI={view.vsAI}
          exitLabel="Back to Menu"
          onGameEnd={() => setView({ name: 'home' })}
        />
      </div>
    );
  }

  // Home — neon logo + the three game modes.
  return (
    <div className="app screen doodle-bg menu-home">
      <h1 className="neon-title menu-logo-text">
        NEON CITY
        <span className="neon-subtitle">Bug Busters</span>
      </h1>
      <div style={{ height: 40 }} />
      <button className="img-btn yellow menu-btn" onClick={() => setView({ name: 'mapSelect' })}>
        Campaign
      </button>
      <div style={{ height: 16 }} />
      <button
        className="img-btn yellow menu-btn"
        onClick={() => setView({ name: 'quickCharSelect' })}
      >
        Quick Match
      </button>
      <div style={{ height: 16 }} />
      <button
        className="img-btn yellow menu-btn"
        onClick={() => setView({ name: 'duelCharSelect' })}
      >
        2 Players
      </button>
      <div style={{ height: 16 }} />
      <button className="img-btn grey menu-btn" onClick={() => setView({ name: 'howto' })}>
        How to Play
      </button>
    </div>
  );
}
