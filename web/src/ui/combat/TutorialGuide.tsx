import { Icon } from '../Icons';
import { useT } from '../../i18n';
import { Lesson, LESSON_COUNT, showsBar } from '../tutorialScript';
import { clamp } from './theme';

// --- Training Grid coach UI ----------------------------------------------------
// Two presentations of the same lesson script:
//   modal  — a card over a scrim; the battle is paused behind it.
//   action — a slim bar over the board while the player performs the step,
//            with a bouncing arrow pointing at the control to tap.

function LessonArt({ art }: { art: NonNullable<Lesson['art']> }) {
  const t = useT();
  if (art === 'sides') {
    return (
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
    );
  }
  if (art === 'bot') {
    return (
      <span className="tut-glyph" aria-hidden>
        <Icon name="robot" size={38} color="#00e5ff" />
      </span>
    );
  }
  if (art === 'zap') {
    return (
      <span className="tut-glyph zap" aria-hidden>
        <Icon name="flash" size={34} color="#ffd23f" />
      </span>
    );
  }
  if (art === 'goal') {
    return (
      <span className="tut-glyph row goal" aria-hidden>
        <Icon name="star" size={26} color="#ffd23f" />
        <Icon name="star" size={26} color="#ffd23f" />
        <Icon name="star" size={26} color="#ffd23f" />
      </span>
    );
  }
  return (
    <span className="tut-glyph row" aria-hidden>
      <Icon name="check" size={26} color="#3dff8f" />
      <Icon name="check" size={26} color="#3dff8f" />
      <Icon name="check" size={26} color="#3dff8f" />
    </span>
  );
}

export function TutorialGuide({
  W,
  lesson,
  lessonNo,
  onNext,
  onSkip,
}: {
  W: number;
  lesson: Lesson;
  lessonNo: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const titleKey = `train.${lesson.id}.title`;
  const textKey = `train.${lesson.id}.text`;
  const counter = lessonNo > 0 ? t('train.step', { n: lessonNo, total: LESSON_COUNT }) : null;

  if (lesson.kind === 'modal') {
    return (
      <div className={`tut-scrim ${lesson.anchor}`} data-lesson={lesson.id}>
        <div className="tut-card" style={{ width: clamp(W * 0.4, 250, 380) }}>
          {counter && <span className="tut-step">{counter}</span>}
          <span className="tut-title">{t(titleKey)}</span>
          {lesson.art && <LessonArt art={lesson.art} />}
          <span className="tut-text">{t(textKey)}</span>
          <button className="img-btn yellow tut-next" onClick={onNext}>
            {t('combat.gotIt')}
          </button>
          <button className="tut-skip" onClick={onSkip}>
            {t('train.skip')}
          </button>
        </div>
        {lesson.anchor === 'bottom' && (
          <span className="tut-arrow" aria-hidden>
            ▼
          </span>
        )}
      </div>
    );
  }

  if (!showsBar(lesson)) return null;

  // Action lessons never block input: the bar floats above the board and the
  // gate (in Combat) is what keeps the player on the taught move.
  return (
    <>
      <div className="tut-bar" data-lesson={lesson.id} role="status">
        <span className="tut-bar-main">
          {counter && <span className="tut-step">{counter}</span>}
          <span className="tut-bar-title">{t(titleKey)}</span>
        </span>
        <span className="tut-bar-text">{t(textKey)}</span>
        <button className="tut-skip" onClick={onSkip}>
          {t('train.skip')}
        </button>
      </div>
      {(lesson.pointer === 'perkBar' || lesson.pointer === 'confirm') && (
        <span className="tut-arrow docked" aria-hidden>
          ▼
        </span>
      )}
    </>
  );
}
