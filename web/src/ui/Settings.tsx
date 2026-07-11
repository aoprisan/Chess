import { useState } from 'react';
import { CampaignController } from '../campaign/controller';
import { LanguageToggle } from './LanguageToggle';
import { Icon } from './Icons';
import { useT } from '../i18n';

// Settings: language switch plus a guarded campaign-progress reset.
export function Settings({
  controller,
  onBack,
}: {
  controller: CampaignController;
  onBack: () => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  return (
    <div className="screen doodle-bg settings-screen">
      <button className="img-btn grey" onClick={onBack}>
        <Icon name="arrowBack" size={14} color="#e8f4ff" />
        {t('common.backToMenu')}
      </button>
      <h1 className="neon-title settings-title">{t('settings.title')}</h1>

      <div className="settings-section">
        <p className="settings-label">{t('lang.label')}</p>
        <LanguageToggle />
      </div>

      <div className="settings-section danger">
        <p className="settings-label">{t('settings.resetProgress')}</p>
        {resetDone ? (
          <p className="settings-note">{t('settings.resetDone')}</p>
        ) : confirming ? (
          <>
            <p className="settings-note">{t('settings.resetConfirmBody')}</p>
            <div className="tp-actions">
              <button className="img-btn grey" onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="img-btn red"
                onClick={() => {
                  controller.resetProgress();
                  setConfirming(false);
                  setResetDone(true);
                }}
              >
                {t('settings.resetConfirm')}
              </button>
            </div>
          </>
        ) : (
          <button className="img-btn red" onClick={() => setConfirming(true)}>
            {t('settings.resetProgress')}
          </button>
        )}
      </div>
    </div>
  );
}
