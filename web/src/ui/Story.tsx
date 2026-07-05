import { charactersForMap } from '../game/characters';
import { CharacterPortrait } from './CharacterPortrait';
import { Icon } from './Icons';

// The Story: a short, kid-friendly intro to Neon City — why the city
// glitched, who the Fixers are, and what the campaign is about. Reuses the
// How to Play card styling so the two info screens feel like one book.

const CHAPTERS: { title: string; paragraphs: string[] }[] = [
  {
    title: 'Welcome to Neon City',
    paragraphs: [
      'Neon City is a city that runs on light. Glowing data lines hum under every street, ' +
        'metro trains glide on beams of code, and sky bridges sparkle high above the clouds. ' +
        'Everything works together, all day and all night — as long as the lines stay bright.',
    ],
  },
  {
    title: 'The Glitch Storm',
    paragraphs: [
      'One night, a huge glitch storm rolled in. Sneaky little bugs crawled into the data ' +
        'lines and started flipping things the wrong way: doors opened backwards, traffic ' +
        'lights blinked pink, and the metro trains went around in circles!',
      'The city computers tried their best, but there were just too many bugs. ' +
        'Neon City needed help — fast.',
    ],
  },
  {
    title: 'Meet the Fixers',
    paragraphs: [
      'Deep in an old repair shop, five little repair bots booted up: Bitzy, Pixel, Cache, ' +
        'Sparky, and Momo. They are Fixers — friendly bots built to squash bugs and make ' +
        'broken lines glow again. And they are YOUR crew!',
      'Fixers repair a data line by filling it up with repair bots. Fix enough lines, and a ' +
        'whole system comes back to life. All over the city, other Fixers are waiting to see ' +
        'what your crew can do — impress them, and they will join you.',
    ],
  },
  {
    title: 'Your Mission',
    paragraphs: [
      'Three big systems keep Neon City running: the Street Grid down below, the Metro Net ' +
        'that moves everyone around, and the mighty Sky Core at the very top.',
      'Travel through each system, win lane battles against the glitches, and recruit all ' +
        '23 Fixers along the way. Restore every critical system, and Neon City will shine ' +
        'brighter than ever. Ready, crew? Let’s go bust some bugs!',
    ],
  },
];

export function Story({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const starters = charactersForMap(0);
  return (
    <div className="screen doodle-bg howto">
      <div className="overlay-header">
        <button className="chip" onClick={onBack}>
          <Icon name="arrowBack" size={20} color="#e8f4ff" />
          Menu
        </button>
        <span style={{ flex: 1 }} />
        <span className="chip">The Story</span>
      </div>

      <div className="howto-scroll">
        {CHAPTERS.map((chapter) => (
          <div className="howto-card" key={chapter.title}>
            <h2 className="howto-heading">{chapter.title}</h2>
            {chapter.paragraphs.map((text) => (
              <p className="story-p" key={text.slice(0, 24)}>
                {text}
              </p>
            ))}
            {chapter.title === 'Meet the Fixers' && (
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
          Start the Campaign
        </button>
      </div>
    </div>
  );
}
