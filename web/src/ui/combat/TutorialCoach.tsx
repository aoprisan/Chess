import { Icon } from '../Icons';
import { TutorialStep } from '../tutorial';
import { useT } from '../../i18n';
import { clamp } from './theme';

// --- First-battle tutorial coach marks -----------------------------------------

const TUTORIAL_CARDS: Record<
  TutorialStep,
  { titleKey: string; textKey: string; anchor: 'center' | 'bottom' }
> = {
  sides: { titleKey: 'tut.sides.title', textKey: 'tut.sides.text', anchor: 'center' },
  deploy: { titleKey: 'tut.deploy.title', textKey: 'tut.deploy.text', anchor: 'center' },
  power: { titleKey: 'tut.power.title', textKey: 'tut.power.text', anchor: 'bottom' },
  win: { titleKey: 'tut.win.title', textKey: 'tut.win.text', anchor: 'center' },
};

export function TutorialCoach({
  W,
  step,
  onNext,
  onSkip,
}: {
  W: number;
  step: TutorialStep;
  onNext: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const card = TUTORIAL_CARDS[step];
  return (
    <div className={`tut-scrim ${card.anchor}`}>
      <div className="tut-card" style={{ width: clamp(W * 0.4, 250, 380) }}>
        <span className="tut-title">{t(card.titleKey)}</span>

        {step === 'sides' && (
          <div className="tut-halves" aria-hidden>
            <span className="tut-half p1">
              <Icon name="robot" size={22} color="#00e5ff" />
              {t('combat.you')}
            </span>
            <span className="tut-half p2">
              <Icon name="robot" size={22} color="#ff2fd6" />
              {t('combat.rival')}
            </span>
          </div>
        )}
        {step === 'deploy' && (
          <span className="tut-glyph" aria-hidden>
            <Icon name="robot" size={38} color="#00e5ff" />
          </span>
        )}
        {step === 'win' && (
          <span className="tut-glyph row" aria-hidden>
            <Icon name="check" size={26} color="#3dff8f" />
            <Icon name="check" size={26} color="#3dff8f" />
            <Icon name="check" size={26} color="#3dff8f" />
          </span>
        )}

        <span className="tut-text">{t(card.textKey)}</span>

        <button className="img-btn yellow tut-next" onClick={onNext}>
          {t('combat.gotIt')}
        </button>
        <button className="tut-skip" onClick={onSkip}>
          {t('combat.skipLessons')}
        </button>
      </div>
      {step === 'power' && (
        <span className="tut-arrow" aria-hidden>
          ▼
        </span>
      )}
    </div>
  );
}
