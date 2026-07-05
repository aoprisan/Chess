import { CampaignController } from '../campaign/controller';
import { CAMPAIGN_MAP_IDS, CampaignMapId } from '../campaign/model';
import { Icon } from './Icons';
import { useLang, useT, mapName } from '../i18n';

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
  const t = useT();
  const { lang } = useLang();
  return (
    <div className="screen doodle-bg level-select">
      <h1 className="ls-title">{t('mapSelect.title')}</h1>
      <p className="ls-subtitle">
        {t('mapSelect.crewSeats', { crew: controller.crew.length, seats: controller.seats })}
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
                <span className="ls-card-name">{mapName(map.name, lang)}</span>
                <span className="ls-card-desc">
                  {unlocked
                    ? t(`map.blurb.${mapId}`)
                    : t('mapSelect.unlockHint', {
                        map: mapName(controller.maps[CAMPAIGN_MAP_IDS[index - 1]].name, lang),
                      })}
                </span>
              </div>
              <div className="ls-card-status">
                {unlocked ? (
                  <>
                    <span className="ls-card-stars">
                      <Icon name="flash" size={14} color={completed ? '#3dff8f' : '#00e5ff'} />
                      {t('mapSelect.secured', { cleared, total })}
                    </span>
                    {completed && <span className="ls-card-done">{t('mapSelect.restored')}</span>}
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
          {t('common.backToMenu')}
        </button>
        <button className="img-btn yellow" onClick={onRoster}>
          {t('common.crew')}
        </button>
      </div>
    </div>
  );
}
