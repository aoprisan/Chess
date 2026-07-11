import { CampaignController } from '../campaign/controller';
import { characterById } from '../game/characters';
import { CharacterPortrait } from './CharacterPortrait';
import { useT } from '../i18n';

// Full-screen celebration shown when the AI Core (map_3) falls — the campaign
// is won. Re-openable from the campaign header's trophy chip afterwards.
export function VictoryScreen({
  controller,
  onClose,
}: {
  controller: CampaignController;
  onClose: () => void;
}) {
  const t = useT();
  const crew = controller.crew.map(characterById);
  return (
    <div className="modal-scrim" style={{ zIndex: 45 }} onClick={onClose}>
      <div className="victory-panel" onClick={(e) => e.stopPropagation()}>
        <div className="victory-glyph" aria-hidden>
          🏆
        </div>
        <h1 className="neon-title victory-title">{t('victory.title')}</h1>
        <p className="victory-body">{t('victory.body')}</p>
        <p className="victory-crew-label">{t('victory.crew', { count: crew.length })}</p>
        <div className="victory-crew">
          {crew.map((c) => (
            <CharacterPortrait
              key={c.id}
              character={c}
              style={{ width: 40, height: 40, objectFit: 'contain' }}
            />
          ))}
        </div>
        <div className="tp-actions" style={{ marginTop: 18 }}>
          <button className="img-btn yellow" onClick={onClose}>
            {t('victory.back')}
          </button>
        </div>
      </div>
    </div>
  );
}
