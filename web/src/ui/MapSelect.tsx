import { CampaignController } from '../campaign/controller';
import { CAMPAIGN_MAP_IDS, CampaignMapId } from '../campaign/model';
import { Icon } from './Icons';

const MAP_BLURBS: Record<CampaignMapId, string> = {
  map_1: 'The city streets are glitching. Restore the local systems!',
  map_2: 'The transit network is scrambled. Fix the lines below the city!',
  map_3: 'The AI Core awaits at the top of the sky towers. Reboot Neon City!',
};

// System (map) picker for the campaign: three cards with lock state and
// critical progress, plus crew size and a Crew roster shortcut.
export function MapSelect({
  controller,
  onPick,
  onRoster,
  onBack,
}: {
  controller: CampaignController;
  onPick: (mapId: CampaignMapId) => void;
  onRoster: () => void;
  onBack: () => void;
}) {
  return (
    <div className="screen doodle-bg level-select">
      <h1 className="ls-title">Choose a System</h1>
      <p className="ls-subtitle">
        Crew: {controller.crew.length} / 23 · Battle seats: {controller.seats}
      </p>
      <div className="ls-list">
        {CAMPAIGN_MAP_IDS.map((mapId, index) => {
          const map = controller.maps[mapId];
          const unlocked = controller.isMapUnlocked(mapId);
          const completed = controller.isMapCompleted(mapId);
          const [cleared, total] = controller.criticalProgress(mapId);
          return (
            <button
              key={mapId}
              className={`ls-card${unlocked ? '' : ' locked'}${completed ? ' completed' : ''}`}
              disabled={!unlocked}
              onClick={() => onPick(mapId)}
            >
              <div className="ls-card-level">{index + 1}</div>
              <div className="ls-card-info">
                <span className="ls-card-name">{map.name}</span>
                <span className="ls-card-desc">
                  {unlocked
                    ? MAP_BLURBS[mapId]
                    : `Secure all critical systems in ${controller.maps[CAMPAIGN_MAP_IDS[index - 1]].name} to unlock.`}
                </span>
              </div>
              <div className="ls-card-status">
                {unlocked ? (
                  <>
                    <span className="ls-card-stars">
                      <Icon name="flash" size={14} color={completed ? '#3dff8f' : '#00e5ff'} />
                      {cleared}/{total} secured
                    </span>
                    {completed && <span className="ls-card-done">Restored!</span>}
                  </>
                ) : (
                  <Icon name="lock" size={22} color="#8899bb" />
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="ls-bottombar">
        <button className="img-btn grey" onClick={onBack}>
          Back to menu
        </button>
        <button className="img-btn yellow" onClick={onRoster}>
          Crew
        </button>
      </div>
    </div>
  );
}
