import { useEffect, useRef, useState } from 'react';
import { AdventureMapDef, loadAdventureMap } from '../adventure/map';
import { JourneyMeta, nextJourney } from '../adventure/levels';
import { hasSavedJourney } from '../adventure/progress';
import { HeroType } from '../game/hero';
import { BASE_URL, ui } from './assets';
import { HeroSelect } from './HeroSelect';
import { AdventureMap } from './AdventureMap';
import { LevelSelect } from './LevelSelect';

type View =
  | { name: 'home' }
  | { name: 'levels' }
  | { name: 'heroSelect'; journeyId: string }
  | { name: 'adventure'; journeyId: string; newJourneyHero?: HeroType };

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [loadError, setLoadError] = useState<string | null>(null);
  // Journey maps load on demand (bigger levels shouldn't delay first paint)
  // and are cached for the session.
  const mapsRef = useRef<Map<string, AdventureMapDef>>(new Map());
  const [, setLoadedCount] = useState(0);

  const journeyId = view.name === 'adventure' ? view.journeyId : null;
  const map = journeyId ? mapsRef.current.get(journeyId) : undefined;

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

  if (loadError) {
    return (
      <div className="app screen doodle-bg menu-home">
        <h1 className="menu-error">Oops!</h1>
        <p className="menu-error-detail">Could not load the adventure map.</p>
        <p className="menu-error-detail" style={{ fontSize: 12 }}>{loadError}</p>
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

  // Home — mirrors the Flutter main menu (logo + styled buttons).
  return (
    <div className="app screen doodle-bg menu-home">
      <img className="menu-logo" src={ui.logo} alt="Kiddie Chess" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <div style={{ height: 60 }} />
      <button className="img-btn yellow menu-btn" onClick={() => setView({ name: 'levels' })}>
        Adventure
      </button>
    </div>
  );
}
