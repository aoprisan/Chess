import { JOURNEYS, JourneyMeta, unlockedLevel, bestStarsFor } from '../adventure/levels';
import { hasSavedJourney, savedJourneyHero } from '../adventure/progress';
import { heroByType } from '../game/hero';
import { heroImage } from './assets';
import { Icon } from './Icons';

// Level picker: journeys unlock in order, each one a bigger map. Cards show
// the in-progress hero or the best star haul once the level is beaten.

export function LevelSelect({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (journey: JourneyMeta) => void;
}) {
  const unlocked = unlockedLevel();
  return (
    <div className="screen doodle-bg level-select">
      <div className="overlay-header">
        <button className="chip" onClick={onBack}>
          <Icon name="arrowBack" size={20} color="#5D4037" />
          Menu
        </button>
      </div>
      <div className="level-list">
        <h1 className="level-title">Choose Your Adventure</h1>
        {JOURNEYS.map((journey) => {
          const locked = journey.level > unlocked;
          const best = bestStarsFor(journey.id);
          const inProgress = !locked && hasSavedJourney(journey.id);
          const heroType = inProgress ? savedJourneyHero(journey.id) : undefined;
          return (
            <button
              key={journey.id}
              className={`level-card${locked ? ' locked' : ''}`}
              disabled={locked}
              onClick={() => onPick(journey)}
            >
              <span className="level-num">{journey.level}</span>
              <span className="level-info">
                <span className="level-name">{journey.name}</span>
                <span className="level-sub">
                  {locked
                    ? `Finish Level ${journey.level - 1} to unlock`
                    : best !== undefined
                      ? 'Completed — play again!'
                      : inProgress
                        ? 'Journey in progress'
                        : 'A new journey awaits!'}
                </span>
              </span>
              <span className="level-status">
                {locked ? (
                  <Icon name="lock" size={22} color="rgba(93,64,55,0.6)" />
                ) : best !== undefined ? (
                  <>
                    <Icon name="star" size={20} color="#FFC107" />
                    <span className="level-stars">{best}</span>
                  </>
                ) : heroType ? (
                  <img className="level-hero" src={heroImage(heroByType(heroType).imagePath)} alt="" />
                ) : (
                  <Icon name="sparkle" size={22} color="#8D6E63" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
