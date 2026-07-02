import { useEffect, useState } from 'react';
import { AdventureMapDef, loadAdventureMap } from '../adventure/map';
import { hasSavedJourney } from '../adventure/progress';
import { HeroType } from '../game/hero';
import { BASE_URL, ui } from './assets';
import { HeroSelect } from './HeroSelect';
import { AdventureMap } from './AdventureMap';

type View =
  | { name: 'home' }
  | { name: 'heroSelect' }
  | { name: 'adventure'; newJourneyHero?: HeroType };

export function App() {
  const [map, setMap] = useState<AdventureMapDef | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: 'home' });

  useEffect(() => {
    loadAdventureMap(BASE_URL)
      .then(setMap)
      .catch((e) => setLoadError(String(e)));
  }, []);

  if (loadError) {
    return (
      <div className="app screen doodle-bg menu-home">
        <h1 className="menu-error">Oops!</h1>
        <p className="menu-error-detail">Could not load the adventure map.</p>
        <p className="menu-error-detail" style={{ fontSize: 12 }}>{loadError}</p>
      </div>
    );
  }

  if (!map) {
    return (
      <div className="app screen doodle-bg menu-home">
        <div className="spinner" />
      </div>
    );
  }

  if (view.name === 'heroSelect') {
    return (
      <div className="app">
        <HeroSelect
          onBack={() => setView({ name: 'home' })}
          onPick={(hero) => setView({ name: 'adventure', newJourneyHero: hero })}
        />
      </div>
    );
  }

  if (view.name === 'adventure') {
    return (
      <div className="app">
        <AdventureMap
          map={map}
          newJourneyHero={view.newJourneyHero}
          onExit={() => setView({ name: 'home' })}
          onNewJourney={() => setView({ name: 'heroSelect' })}
        />
      </div>
    );
  }

  // Home — mirrors the Flutter main menu (logo + styled buttons).
  // Adventure resumes a saved journey directly, else opens hero selection.
  return (
    <div className="app screen doodle-bg menu-home">
      <img className="menu-logo" src={ui.logo} alt="Kiddie Chess" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <div style={{ height: 60 }} />
      <button
        className="img-btn yellow menu-btn"
        onClick={() =>
          hasSavedJourney() ? setView({ name: 'adventure' }) : setView({ name: 'heroSelect' })
        }
      >
        Adventure
      </button>
    </div>
  );
}
