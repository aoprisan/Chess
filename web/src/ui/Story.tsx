import { charactersForMap } from '../game/characters';
import { CharacterPortrait } from './CharacterPortrait';
import { Icon } from './Icons';
import { useT } from '../i18n';

// The Story: a short, kid-friendly intro to Neon City — why the city
// glitched, who the Fixers are, and what the campaign is about. Reuses the
// How to Play card styling so the two info screens feel like one book. Text
// lives in the i18n catalog; chapters are referenced by stable key ids.

const CHAPTERS: { id: string; titleKey: string; paragraphKeys: string[]; cast?: boolean }[] = [
  { id: 'c1', titleKey: 'story.c1.title', paragraphKeys: ['story.c1.p1'] },
  { id: 'c2', titleKey: 'story.c2.title', paragraphKeys: ['story.c2.p1', 'story.c2.p2'] },
  { id: 'c3', titleKey: 'story.c3.title', paragraphKeys: ['story.c3.p1', 'story.c3.p2'], cast: true },
  { id: 'c4', titleKey: 'story.c4.title', paragraphKeys: ['story.c4.p1', 'story.c4.p2'] },
];

export function Story({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const t = useT();
  const starters = charactersForMap(0);
  return (
    <div className="screen doodle-bg howto">
      <div className="overlay-header">
        <button className="chip" onClick={onBack}>
          <Icon name="arrowBack" size={20} color="#e8f4ff" />
          {t('common.menu')}
        </button>
        <span style={{ flex: 1 }} />
        <span className="chip">{t('story.chip')}</span>
      </div>

      <div className="howto-scroll">
        {CHAPTERS.map((chapter) => (
          <div className="howto-card" key={chapter.id}>
            <h2 className="howto-heading">{t(chapter.titleKey)}</h2>
            {chapter.paragraphKeys.map((key) => (
              <p className="story-p" key={key}>
                {t(key)}
              </p>
            ))}
            {chapter.cast && (
              <div className="story-cast">
                {starters.map((ch) => (
                  <div className="story-cast-item" key={ch.id}>
                    <CharacterPortrait character={ch} className="story-cast-portrait" />
                    <span className="story-cast-name" style={{ color: ch.accent }}>
                      {ch.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <button className="img-btn yellow menu-btn" onClick={onPlay}>
          {t('story.start')}
        </button>
      </div>
    </div>
  );
}
