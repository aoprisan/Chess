import { useEffect, useRef, useState } from 'react';
import { AdventureMapDef, loadAdventureMap } from '../adventure/map';
import { JourneyMeta, nextJourney } from '../adventure/levels';
import { hasSavedJourney } from '../adventure/progress';
import { ALL_HEROES, HeroType, heroByType } from '../game/hero';
import { BASE_URL, ui } from './assets';
import { preloadGameImages } from './preload';
import { AI_DIFFICULTIES, AIDifficulty, HeroSelect } from './HeroSelect';
import { AdventureMap } from './AdventureMap';
import { HowToPlay } from './HowToPlay';
import { LevelSelect } from './LevelSelect';
import { Combat } from './Combat';

type View =
  | { name: 'home' }
  | { name: 'howto' }
  | { name: 'levels' }
  | { name: 'heroSelect'; journeyId: string }
  | { name: 'adventure'; journeyId: string; newJourneyHero?: HeroType }
  // Standalone battles (outside Adventure)
  | { name: 'soloHeroSelect' }
  | { name: 'duelHeroSelect'; p1?: HeroType }
  | { name: 'battle'; p1: HeroType; p2: HeroType; vsAI: boolean; difficulty: AIDifficulty };

/** Rival for a solo battle: a random hero other than the player's pick. */
function randomRival(p1: HeroType): HeroType {
  const others = ALL_HEROES.filter((h) => h.type !== p1);
  return others[Math.floor(Math.random() * others.length)].type;
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
  // All game art loads up front behind a progress bar, so no screen ever
  // paints with half-loaded images (the adventure map used to swap biome
  // backgrounds mid-scroll while they streamed in).
  const [assetProgress, setAssetProgress] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  // Journey maps load on demand (bigger levels shouldn't delay first paint)
  // and are cached for the session.
  const mapsRef = useRef<Map<string, AdventureMapDef>>(new Map());
  const [, setLoadedCount] = useState(0);

  const journeyId = view.name === 'adventure' ? view.journeyId : null;
  const map = journeyId ? mapsRef.current.get(journeyId) : undefined;

  useEffect(() => {
    let stale = false;
    void preloadGameImages((fraction) => {
      if (!stale) setAssetProgress(fraction);
    }).then(() => {
      if (!stale) setAssetsReady(true);
    });
    return () => {
      stale = true;
    };
  }, []);

  useEffect(() => {
    if (!journeyId || mapsRef.current.has(journeyId)) return;
    let stale = false;
    loadAdventureMap(BASE_URL, journeyId)
      .then((loaded) => {
        if (stale) return;
        mapsRef.current.set(journeyId, loaded);
        setLoadedCount((c) => c + 1);
      })
      .catch((e) => !stale && setLoadError(String(e)));
    return () => {
      stale = true;
    };
  }, [journeyId]);

  if (!assetsReady) {
    const percent = Math.round(assetProgress * 100);
    return (
      <div className="app screen menu-home boot-screen">
        <h1 className="boot-title">Kiddie Chess</h1>
        <div className="boot-bar">
          <div className="boot-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="boot-label">Loading… {percent}%</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app screen doodle-bg menu-home">
        <h1 className="menu-error">Oops!</h1>
        <p className="menu-error-detail">Could not load the adventure map.</p>
        <p className="menu-error-detail" style={{ fontSize: 12 }}>{loadError}</p>
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

  if (view.name === 'levels') {
    return (
      <div className="app">
        <LevelSelect
          onBack={() => setView({ name: 'home' })}
          onPick={(journey: JourneyMeta) => setView({ name: 'adventure', journeyId: journey.id })}
        />
      </div>
    );
  }

  if (view.name === 'heroSelect') {
    return (
      <div className="app">
        <HeroSelect
          onBack={() => setView({ name: 'levels' })}
          onPick={(hero) => setView({ name: 'adventure', journeyId: view.journeyId, newJourneyHero: hero })}
        />
      </div>
    );
  }

  // Play Solo: pick your hero and rival difficulty, then fight a random rival.
  if (view.name === 'soloHeroSelect') {
    return (
      <div className="app">
        <HeroSelect
          onBack={() => setView({ name: 'home' })}
          difficulty={soloDifficulty}
          onDifficultyChange={(d) => {
            setSoloDifficulty(d);
            saveSoloDifficulty(d);
          }}
          onPick={(hero) =>
            setView({ name: 'battle', p1: hero, p2: randomRival(hero), vsAI: true, difficulty: soloDifficulty })
          }
        />
      </div>
    );
  }

  // 2 Players (same device): each player picks a hero, then pass-and-play.
  if (view.name === 'duelHeroSelect') {
    const pickingP1 = view.p1 === undefined;
    return (
      <div className="app">
        <HeroSelect
          key={pickingP1 ? 'p1' : 'p2'}
          playerLabel={pickingP1 ? 'Player 1' : 'Player 2'}
          backLabel={pickingP1 ? 'Back to menu' : 'Back'}
          onBack={() => setView(pickingP1 ? { name: 'home' } : { name: 'duelHeroSelect' })}
          onPick={(hero) =>
            pickingP1
              ? setView({ name: 'duelHeroSelect', p1: hero })
              : setView({ name: 'battle', p1: view.p1!, p2: hero, vsAI: false, difficulty: 'medium' })
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
          player1Hero={heroByType(view.p1)}
          player2Hero={heroByType(view.p2)}
          aiDifficulty={view.difficulty}
          player2IsAI={view.vsAI}
          exitLabel="Back to Menu"
          onGameEnd={() => setView({ name: 'home' })}
        />
      </div>
    );
  }

  if (view.name === 'adventure') {
    if (!map) {
      return (
        <div className="app screen doodle-bg menu-home">
          <div className="spinner" />
        </div>
      );
    }
    // Picking a level with no saved journey goes to hero selection first.
    if (!view.newJourneyHero && !hasSavedJourney(map.id)) {
      return (
        <div className="app">
          <HeroSelect
            onBack={() => setView({ name: 'levels' })}
            onPick={(hero) => setView({ name: 'adventure', journeyId: map.id, newJourneyHero: hero })}
          />
        </div>
      );
    }
    return (
      <div className="app">
        <AdventureMap
          key={`${map.id}:${view.newJourneyHero ?? 'resume'}`}
          map={map}
          newJourneyHero={view.newJourneyHero}
          onExit={() => setView({ name: 'levels' })}
          onNewJourney={() => setView({ name: 'heroSelect', journeyId: map.id })}
          onNextLevel={(hero) => {
            const next = nextJourney(map.id);
            if (next) setView({ name: 'adventure', journeyId: next.id, newJourneyHero: hero });
          }}
        />
      </div>
    );
  }

  // Home — logo + the three game modes.
  return (
    <div className="app screen doodle-bg menu-home">
      <img className="menu-logo" src={ui.logo} alt="Kiddie Chess" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <div style={{ height: 48 }} />
      <button className="img-btn yellow menu-btn" onClick={() => setView({ name: 'soloHeroSelect' })}>
        Play Solo
      </button>
      <div style={{ height: 16 }} />
      <button className="img-btn yellow menu-btn" onClick={() => setView({ name: 'levels' })}>
        Adventure
      </button>
      <div style={{ height: 16 }} />
      <button className="img-btn yellow menu-btn" onClick={() => setView({ name: 'duelHeroSelect' })}>
        2 Players
      </button>
      <div style={{ height: 16 }} />
      <button className="img-btn grey menu-btn" onClick={() => setView({ name: 'howto' })}>
        How to Play
      </button>
    </div>
  );
}
