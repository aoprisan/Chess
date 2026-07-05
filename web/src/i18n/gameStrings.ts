// Translations for the game data (perk catalog, Fixers, effect names, map
// names) plus the battle move-log formatter. English is the source of truth
// (kept in game/*.ts); the `ro` maps below are overrides with English
// fallback. Proper character names (Bitzy, Pixel, …) are never translated.

import type { Lang } from './index';
import type { PerkInfo } from '../game/perks';
import type { Character } from '../game/characters';
import type { MoveLogMsg } from '../game/engine';
import { getPerk } from '../game/perks';

// --- Perks -------------------------------------------------------------------

const PERK_RO: Record<number, { name: string; description: string }> = {
  0: { name: 'Pasează', description: 'Sări peste tură' },
  1: { name: 'Trimite robot', description: 'Adaugă 1 robot oriunde' },
  2: { name: 'Zap de eroare', description: 'Zap 1 robot inamic' },
  4: { name: 'Blocare', description: 'Îngheață o linie 1 tură' },
  22: { name: 'Mod invizibil', description: 'Ascunde roboții 2 ture' },
  24: { name: 'Poartă warp', description: 'Roboții inamici ricoșează' },
  25: { name: 'Capcană dulce', description: 'Roboții inamici sunt mâncați' },
  26: { name: 'Imitator', description: '+1 acum; copiază inamicii' },
  27: { name: 'Ecou ping', description: '+1 acum; ecou la inamici' },
  28: { name: 'Val de energie', description: '+1 acum; șochează inamicii' },
  29: { name: 'Duplicator', description: 'Robotul pierdut revine ca 2' },
  30: { name: 'Scurtcircuit', description: 'Robotul pierdut zap-uie 2' },
  46: { name: 'Copie în cloud', description: 'Robotul pierdut revine' },
  33: { name: 'Redirecționare', description: 'Schimbă roboții între linii' },
  35: { name: 'Împrăștiere', description: 'Mută-ți roboții în jur' },
  43: { name: 'Far', description: '+1 acum; împrumută 1 mai târziu' },
  49: { name: 'Zonă sigură', description: 'Pierderile tale ajung aici' },
  52: { name: 'Revenire', description: '+1 acum; revii pe furiș' },
  13: { name: 'Amestecare', description: 'Amestecă toți inamicii' },
  23: { name: 'Furtună statică', description: 'Bruiază ecranele 2 ture' },
  31: { name: 'Divizare', description: 'Schimbă 1 robot pe 2' },
  32: { name: 'Supraîncărcare', description: 'Explodează 1; inamicul −2' },
  34: { name: 'Fire încrucișate', description: 'Schimbă inamicii între linii' },
  36: { name: 'Dispersare', description: 'Mută inamicii în jur' },
  37: { name: 'Gambit', description: 'Ei primesc 3, tu 2' },
  38: { name: 'Furt de date', description: 'Ei −1, tu +1' },
  39: { name: 'Asalt', description: 'Ambii +2 aici, tu −1' },
  40: { name: 'Recrutare', description: '+1 acum; furi 1 mai târziu' },
  41: { name: 'Ambuscadă', description: '+1 acum; zap 1 mai târziu' },
  42: { name: 'Întărire', description: '+1 acum; +1 mai târziu' },
  50: { name: 'Magnet', description: 'Inamicii zap-uiți ți se alătură' },
  51: { name: 'Sondă', description: 'Strecoară-te; zar mai târziu' },
  48: { name: 'Firewall', description: 'Curăță toate capcanele' },
};

export function perkName(perk: PerkInfo, lang: Lang): string {
  return lang === 'ro' ? PERK_RO[perk.id]?.name ?? perk.name : perk.name;
}

export function perkDescription(perk: PerkInfo, lang: Lang): string {
  return lang === 'ro' ? PERK_RO[perk.id]?.description ?? perk.description : perk.description;
}

/** Perk name by id (falls back to English/id). */
function perkNameById(id: number, lang: Lang): string {
  const perk = getPerk(id);
  if (!perk) return `#${id}`;
  return perkName(perk, lang);
}

// --- Characters (roles + taglines; names stay as proper nouns) ---------------

const CHARACTER_RO: Record<string, { role: string; tagline: string }> = {
  bitzy: { role: 'Cadet de cod', tagline: 'Blochează erorile înainte să se strecoare.' },
  pixel: { role: 'Artist de patch-uri', tagline: 'Fiecare reparație primește un plus de finisaj.' },
  cache: { role: 'Păzitor de memorie', tagline: 'Copiază lucrurile bune, de două ori.' },
  sparky: { role: 'Tehnician de energie', tagline: 'Înainte cu viteză maximă, scântei peste tot.' },
  momo: { role: 'Ofițer de siguranță', tagline: 'Ține fiecare robot teafăr și nevătămat.' },
  popcorn: { role: 'Meșter de capcane', tagline: 'Lasă surprize dulci pentru erori.' },
  reverb: { role: 'Inginer de ecou', tagline: 'Răspunde la fiecare ping de două ori.' },
  forky: { role: 'Reparator de furci', tagline: 'Schimbă un robot pe doi, de fiecare dată.' },
  swipe: { role: 'Curier de date', tagline: 'Cine găsește păstrează, pachetele plâng.' },
  scatterbug: { role: 'Mutător dezordonat', tagline: 'Niciodată unde te aștepți.' },
  recruta: { role: 'Făuritor de prieteni', tagline: 'Transformă roboții rivali în prieteni.' },
  static: { role: 'Maestru al invizibilității', tagline: 'Acum vezi echipajul, acum nu.' },
  warp: { role: 'Paznic de poartă', tagline: 'Trimite intrușii cu totul în altă parte.' },
  twinsy: { role: 'Șef de clone', tagline: 'De ce un robot când poți avea doi?' },
  sparkplug: { role: 'Fierar de șocuri', tagline: 'Atinge linia, simte zap-ul.' },
  beacon: { role: 'Cercetaș de semnal', tagline: 'Știe mereu unde e mulțimea.' },
  shuffle: { role: 'Jongler de linii', tagline: 'Ține fiecare linie în suspans.' },
  vex: { role: 'Căpitan de val', tagline: 'Călărește vârfurile de energie de distracție.' },
  sponge: { role: 'Șef de rezerve', tagline: 'Nimic nu e cu adevărat pierdut.' },
  payback: { role: 'Șef de replică', tagline: 'Fiecare eroare primește o chitanță.' },
  gamba: { role: 'Negociator', tagline: 'Iese mereu în câștig la final.' },
  magnet: { role: 'Comandant de captură', tagline: 'Ce e zap-uit, e păstrat.' },
  nullo: { role: 'Custode de firewall', tagline: 'Niciun truc permis pe aceste linii.' },
};

export function characterRole(character: Character, lang: Lang): string {
  return lang === 'ro' ? CHARACTER_RO[character.id]?.role ?? character.role : character.role;
}

export function characterTagline(character: Character, lang: Lang): string {
  return lang === 'ro'
    ? CHARACTER_RO[character.id]?.tagline ?? character.tagline
    : character.tagline;
}

// --- Map names (loaded from JSON in English) ---------------------------------

const MAP_NAME_RO: Record<string, string> = {
  'Street Grid': 'Rețeaua Stradală',
  'Metro Net': 'Rețeaua de Metrou',
  'Sky Core': 'Nucleul Cerului',
};

export function mapName(name: string, lang: Lang): string {
  return lang === 'ro' ? MAP_NAME_RO[name] ?? name : name;
}

// --- Difficulty --------------------------------------------------------------

const DIFFICULTY_RO: Record<string, string> = {
  easy: 'Ușor',
  medium: 'Mediu',
  hard: 'Greu',
};

/** Capitalize an English difficulty word ("easy" -> "Easy"). */
function titleCaseWord(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function difficultyLabel(difficulty: string, lang: Lang): string {
  return lang === 'ro' ? DIFFICULTY_RO[difficulty] ?? difficulty : titleCaseWord(difficulty);
}

// --- Engine effect / trigger type names (battle log) -------------------------
// English values match the engine's historical title-cased output exactly.

const EFFECT_NAMES: Record<string, { en: string; ro: string }> = {
  ABSORB: { en: 'Absorb', ro: 'Absorbție' },
  AMBUSH: { en: 'Ambush', ro: 'Ambuscadă' },
  BACKFIRE: { en: 'Backfire', ro: 'Recul' },
  ECHO: { en: 'Echo', ro: 'Ecou' },
  ENLIST: { en: 'Enlist', ro: 'Recrutare' },
  HYDRA: { en: 'Hydra', ro: 'Hidră' },
  MIRROR: { en: 'Mirror', ro: 'Oglindă' },
  PORTAL: { en: 'Portal', ro: 'Portal' },
  REINFORCE: { en: 'Reinforce', ro: 'Întărire' },
  RETALIATE: { en: 'Retaliate', ro: 'Ripostă' },
  SHOCKWAVE: { en: 'Shockwave', ro: 'Undă de șoc' },
  SIGNAL: { en: 'Signal', ro: 'Semnal' },
  TRAP: { en: 'Trap', ro: 'Capcană' },
};

function effectName(type: string, lang: Lang): string {
  const entry = EFFECT_NAMES[type];
  if (!entry) return type.charAt(0) + type.slice(1).toLowerCase();
  return entry[lang];
}

const RAID_LABELS: Record<'probe' | 'bounceProbe', { en: string; ro: string }> = {
  probe: { en: 'Probe', ro: 'sonda' },
  bounceProbe: { en: 'Bounce Back probe', ro: 'sonda Revenire' },
};

function raidLabel(label: 'probe' | 'bounceProbe', lang: Lang): string {
  return RAID_LABELS[label][lang];
}

// --- Battle move-log formatter ----------------------------------------------
// Produces the sentence fragment shown after a hero's name in the Battle Log.

/** Where a perk landed, e.g. " on Lane 3" / " pe Linia 3". */
function perkLanes(msg: Extract<MoveLogMsg, { t: 'perk' }>, lang: Lang): string {
  const perk = getPerk(msg.perkId);
  if (msg.secondLane !== null && msg.lane !== null && msg.lane >= 0) {
    return lang === 'ro'
      ? ` pe Liniile ${msg.secondLane + 1} și ${msg.lane + 1}`
      : ` on Lanes ${msg.secondLane + 1} & ${msg.lane + 1}`;
  }
  if (msg.lane !== null && msg.lane >= 0 && perk?.requiresTarget) {
    return lang === 'ro' ? ` pe Linia ${msg.lane + 1}` : ` on Lane ${msg.lane + 1}`;
  }
  return '';
}

export function formatMoveLog(msg: MoveLogMsg, lang: Lang): string {
  const ro = lang === 'ro';
  switch (msg.t) {
    case 'place':
      return ro ? `a așezat o piesă pe Linia ${msg.lane + 1}` : `placed a piece in Lane ${msg.lane + 1}`;
    case 'placeBonus':
      return ro
        ? `a așezat o piesă bonus pe Linia ${msg.lane + 1}`
        : `placed a bonus piece in Lane ${msg.lane + 1}`;
    case 'trigger':
      return ro
        ? `a declanșat ${effectName(msg.effect, lang)} pe Linia ${msg.lane + 1}`
        : `sprung ${effectName(msg.effect, lang)} in Lane ${msg.lane + 1}`;
    case 'deferred':
      return ro
        ? `a rezolvat ${effectName(msg.effect, lang)} pe Linia ${msg.lane + 1}`
        : `resolved ${effectName(msg.effect, lang)} in Lane ${msg.lane + 1}`;
    case 'raidLost':
      return ro
        ? `și-a pierdut ${raidLabel(msg.label, lang)} pe Linia ${msg.lane + 1}`
        : `lost their ${raidLabel(msg.label, lang)} in Lane ${msg.lane + 1}`;
    case 'raidWon2':
      return ro
        ? `a câștigat ${raidLabel(msg.label, lang)} pe Linia ${msg.lane + 1} — 2 recruți s-au alăturat!`
        : `won their ${raidLabel(msg.label, lang)} in Lane ${msg.lane + 1} — 2 recruits joined!`;
    case 'raidWon1':
      return ro
        ? `a câștigat ${raidLabel(msg.label, lang)} pe Linia ${msg.lane + 1} — un recrut s-a alăturat!`
        : `won their ${raidLabel(msg.label, lang)} in Lane ${msg.lane + 1} — a recruit joined!`;
    case 'raidDone':
      return ro
        ? `a terminat ${raidLabel(msg.label, lang)} pe Linia ${msg.lane + 1}`
        : `finished their ${raidLabel(msg.label, lang)} in Lane ${msg.lane + 1}`;
    case 'lane':
      return ro ? `a cucerit Linia ${msg.lane + 1}!` : `conquered Lane ${msg.lane + 1}!`;
    case 'wonBattle':
      return ro ? 'a câștigat bătălia!' : 'won the battle!';
    case 'perk':
      return ro
        ? `a folosit ${perkNameById(msg.perkId, lang)}${perkLanes(msg, lang)}`
        : `used ${perkNameById(msg.perkId, lang)}${perkLanes(msg, lang)}`;
    case 'pass':
      return ro ? 'a pasat tura' : 'passed the turn';
  }
}
