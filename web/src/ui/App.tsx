import { useEffect, useState } from 'react';
import { AdventureMapDef, loadAdventureMap } from '../adventure/map';
import { hasSavedJourney, clearSavedJourney } from '../adventure/progress';
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
  const [savedJourney, setSavedJourney] = useState(false);

  useEffect(() => {
    loadAdventureMap(BASE_URL)
      .then(setMap)
      .catch((e) => setLoadError(String(e)));
  }, []);

  useEffect(() => {
    if (view.name === 'home') setSavedJourney(hasSavedJourney());
  }, [view]);

  if (loadError) {
    return (
      <div className="app screen home">
        <h1>Oops!</h1>
        <p>Could not load the adventure map.</p>
        <p style={{ fontSize: 12 }}>{loadError}</p>
      </div>
    );
  }

  if (!map) {
    return (
      <div className="app screen home">
        <h1>Loading…</h1>
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
        />
      </div>
    );
  }

  // Home
  return (
    <div
      className="app screen home"
      style={{ backgroundImage: `url(${ui.mainBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <img className="logo" src={ui.logo} alt="Kiddie Chess" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <h1>Adventure</h1>
      <p>Cross the maze. Clear the obstacles. Beat the rivals!</p>
      {savedJourney && (
        <button className="btn" onClick={() => setView({ name: 'adventure' })}>
          ▶ Continue Journey
        </button>
      )}
      <button className="btn secondary" onClick={() => setView({ name: 'heroSelect' })}>
        {savedJourney ? '✦ New Journey' : '▶ Start Journey'}
      </button>
      {savedJourney && (
        <button
          className="btn danger"
          onClick={() => {
            clearSavedJourney();
            setSavedJourney(false);
          }}
        >
          ✕ Erase Save
        </button>
      )}
    </div>
  );
}
