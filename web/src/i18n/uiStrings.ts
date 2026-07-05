// UI copy for every screen, keyed by a dotted string id. Each entry carries
// the English source and its Romanian translation. Placeholders use `{name}`
// and are filled by `translate()`. Brand nouns (NEON CITY, Bug Busters) and
// character proper names are intentionally left untranslated.

export interface UIString {
  en: string;
  ro: string;
}

export const UI: Record<string, UIString> = {
  // --- Language switch -------------------------------------------------------
  'lang.english': { en: 'English', ro: 'English' },
  'lang.romanian': { en: 'Română', ro: 'Română' },
  'lang.label': { en: 'Language', ro: 'Limbă' },

  // --- Boot / errors ---------------------------------------------------------
  'boot.booting': { en: 'Booting… {percent}%', ro: 'Se pornește… {percent}%' },
  'error.oops': { en: 'Oops!', ro: 'Hopa!' },
  'error.couldNotLoad': {
    en: 'Could not load Neon City.',
    ro: 'Nu s-a putut încărca Neon City.',
  },

  // --- Home menu -------------------------------------------------------------
  'menu.campaign': { en: 'Campaign', ro: 'Campanie' },
  'menu.quickMatch': { en: 'Quick Match', ro: 'Meci rapid' },
  'menu.twoPlayers': { en: '2 Players', ro: '2 jucători' },
  'menu.story': { en: 'The Story', ro: 'Povestea' },
  'menu.howToPlay': { en: 'How to Play', ro: 'Cum se joacă' },
  'menu.shareGame': { en: 'Share Game', ro: 'Trimite jocul' },

  // --- Common ----------------------------------------------------------------
  'common.back': { en: 'Back', ro: 'Înapoi' },
  'common.backToMenu': { en: 'Back to menu', ro: 'Înapoi la meniu' },
  'common.menu': { en: 'Menu', ro: 'Meniu' },
  'common.cancel': { en: 'Cancel', ro: 'Anulează' },
  'common.close': { en: 'Close', ro: 'Închide' },
  'common.start': { en: 'Start', ro: 'Începe' },
  'common.notYet': { en: 'Not yet', ro: 'Nu încă' },
  'common.crew': { en: 'Crew', ro: 'Echipaj' },

  // --- Map / system select ---------------------------------------------------
  'mapSelect.title': { en: 'Choose a System', ro: 'Alege un sistem' },
  'mapSelect.crewSeats': {
    en: 'Crew: {crew} / 23 · Battle seats: {seats}',
    ro: 'Echipaj: {crew} / 23 · Locuri de luptă: {seats}',
  },
  'mapSelect.unlockHint': {
    en: 'Secure all critical systems in {map} to unlock.',
    ro: 'Securizează toate sistemele critice din {map} pentru a debloca.',
  },
  'mapSelect.secured': { en: '{cleared}/{total} secured', ro: '{cleared}/{total} securizate' },
  'mapSelect.restored': { en: 'Restored!', ro: 'Restaurat!' },
  'map.blurb.map_1': {
    en: 'The city streets are glitching. Restore the local systems!',
    ro: 'Străzile orașului se defectează. Restaurează sistemele locale!',
  },
  'map.blurb.map_2': {
    en: 'The transit network is scrambled. Fix the lines below the city!',
    ro: 'Rețeaua de transport e bulversată. Repară liniile de sub oraș!',
  },
  'map.blurb.map_3': {
    en: 'The AI Core awaits at the top of the sky towers. Reboot Neon City!',
    ro: 'Nucleul AI așteaptă în vârful turnurilor cerului. Repornește Neon City!',
  },

  // --- Story -----------------------------------------------------------------
  'story.chip': { en: 'The Story', ro: 'Povestea' },
  'story.start': { en: 'Start the Campaign', ro: 'Începe campania' },
  'story.c1.title': { en: 'Welcome to Neon City', ro: 'Bun venit în Neon City' },
  'story.c1.p1': {
    en:
      'Neon City is a city that runs on light. Glowing data lines hum under every street, ' +
      'metro trains glide on beams of code, and sky bridges sparkle high above the clouds. ' +
      'Everything works together, all day and all night — as long as the lines stay bright.',
    ro:
      'Neon City este un oraș care merge pe lumină. Linii de date strălucitoare zumzăie sub ' +
      'fiecare stradă, trenurile de metrou alunecă pe raze de cod, iar podurile din cer ' +
      'sclipesc sus deasupra norilor. Totul funcționează împreună, zi și noapte — atâta timp ' +
      'cât liniile rămân aprinse.',
  },
  'story.c2.title': { en: 'The Glitch Storm', ro: 'Furtuna de erori' },
  'story.c2.p1': {
    en:
      'One night, a huge glitch storm rolled in. Sneaky little bugs crawled into the data ' +
      'lines and started flipping things the wrong way: doors opened backwards, traffic ' +
      'lights blinked pink, and the metro trains went around in circles!',
    ro:
      'Într-o noapte, a venit o furtună uriașă de erori. Gândăcei șireți s-au strecurat în ' +
      'liniile de date și au început să încurce lucrurile: ușile se deschideau invers, ' +
      'semafoarele clipeau roz, iar trenurile de metrou se învârteau în cerc!',
  },
  'story.c2.p2': {
    en:
      'The city computers tried their best, but there were just too many bugs. ' +
      'Neon City needed help — fast.',
    ro:
      'Calculatoarele orașului s-au străduit din răsputeri, dar erau prea multe erori. ' +
      'Neon City avea nevoie de ajutor — repede.',
  },
  'story.c3.title': { en: 'Meet the Fixers', ro: 'Fă cunoștință cu Reparatorii' },
  'story.c3.p1': {
    en:
      'Deep in an old repair shop, five little repair bots booted up: Bitzy, Pixel, Cache, ' +
      'Sparky, and Momo. They are Fixers — friendly bots built to squash bugs and make ' +
      'broken lines glow again. And they are YOUR crew!',
    ro:
      'Adânc într-un vechi atelier de reparații, cinci roboței de reparat au pornit: Bitzy, ' +
      'Pixel, Cache, Sparky și Momo. Ei sunt Reparatorii — roboți prietenoși făcuți să strivească ' +
      'erorile și să facă liniile stricate să strălucească din nou. Și sunt echipajul TĂU!',
  },
  'story.c3.p2': {
    en:
      'Fixers repair a data line by filling it up with repair bots. Fix enough lines, and a ' +
      'whole system comes back to life. All over the city, other Fixers are waiting to see ' +
      'what your crew can do — impress them, and they will join you.',
    ro:
      'Reparatorii repară o linie de date umplând-o cu roboți. Repară destule linii și un ' +
      'sistem întreg prinde viață. În tot orașul, alți Reparatori așteaptă să vadă ce poate ' +
      'echipajul tău — impresionează-i și ți se vor alătura.',
  },
  'story.c4.title': { en: 'Your Mission', ro: 'Misiunea ta' },
  'story.c4.p1': {
    en:
      'Three big systems keep Neon City running: the Street Grid down below, the Metro Net ' +
      'that moves everyone around, and the mighty Sky Core at the very top.',
    ro:
      'Trei sisteme mari țin Neon City în funcțiune: Rețeaua Stradală de jos, Rețeaua de ' +
      'Metrou care mută pe toată lumea și puternicul Nucleu al Cerului chiar în vârf.',
  },
  'story.c4.p2': {
    en:
      'Travel through each system, win lane battles against the glitches, and recruit all ' +
      '23 Fixers along the way. Restore every critical system, and Neon City will shine ' +
      'brighter than ever. Ready, crew? Let’s go bust some bugs!',
    ro:
      'Călătorește prin fiecare sistem, câștigă bătălii pe linii împotriva erorilor și ' +
      'recrutează toți cei 23 de Reparatori pe drum. Restaurează fiecare sistem critic, iar ' +
      'Neon City va străluci mai tare ca oricând. Gata, echipaj? Hai să prindem niște erori!',
  },

  // --- How to Play -----------------------------------------------------------
  'howto.chip': { en: 'How to Play', ro: 'Cum se joacă' },
  'howto.battle': { en: 'The Battle', ro: 'Bătălia' },
  'howto.pictures': { en: 'What the pictures mean', ro: 'Ce înseamnă imaginile' },
  'howto.rule.1': {
    en: 'Every turn, one of your repair bots deploys onto a random data line all by itself.',
    ro: 'În fiecare tură, unul dintre roboții tăi se așază singur pe o linie de date la întâmplare.',
  },
  'howto.rule.2': {
    en: 'Then you pick one power — or pass and save your turn.',
    ro: 'Apoi alegi o putere — sau pasezi și îți păstrezi tura.',
  },
  'howto.rule.3': {
    en: 'Fill all 5 of your slots on a line to fix it.',
    ro: 'Umple toate cele 5 locuri de pe o linie ca să o repari.',
  },
  'howto.rule.4': {
    en: 'Fix 3 lines and you win the battle!',
    ro: 'Repară 3 linii și câștigi bătălia!',
  },
  'howto.rule.5': {
    en: 'Tap a power to read what it does before you use it.',
    ro: 'Atinge o putere ca să citești ce face înainte să o folosești.',
  },
  'howto.rule.6': {
    en: 'In the Campaign, powers come from the crew members you bring to the battle.',
    ro: 'În Campanie, puterile vin de la membrii echipajului pe care îi aduci în bătălie.',
  },
  'howto.group.always': { en: 'Always available', ro: 'Mereu disponibile' },
  'howto.group.protect': { en: 'Protect powers', ro: 'Puteri de apărare' },
  'howto.group.action': { en: 'Action powers', ro: 'Puteri de acțiune' },
  'howto.legend.ownBot': { en: 'Your bot', ro: 'Robotul tău' },
  'howto.legend.enemyBot': { en: "Rival's bot", ro: 'Robotul rivalului' },
  'howto.legend.gain': { en: 'Gain bots', ro: 'Câștigi roboți' },
  'howto.legend.lose': { en: 'Lose bots', ro: 'Pierzi roboți' },
  'howto.legend.next': { en: 'Happens next turn', ro: 'Se întâmplă tura următoare' },
  'howto.legend.random': { en: 'Random', ro: 'La întâmplare' },

  // --- Character select ------------------------------------------------------
  'select.title': { en: 'Choose your character', ro: 'Alege-ți personajul' },
  'select.placeholder': { en: 'Select a character', ro: 'Selectează un personaj' },
  'select.player1': { en: 'Player 1', ro: 'Jucător 1' },
  'select.player2': { en: 'Player 2', ro: 'Jucător 2' },
  'select.rivalDifficulty': { en: 'Rival difficulty', ro: 'Dificultatea rivalului' },
  'difficulty.easy': { en: 'Easy', ro: 'Ușor' },
  'difficulty.medium': { en: 'Medium', ro: 'Mediu' },
  'difficulty.hard': { en: 'Hard', ro: 'Greu' },

  // --- Roster ----------------------------------------------------------------
  'roster.title': { en: 'Your Crew', ro: 'Echipajul tău' },
  'roster.subtitle': {
    en:
      "Beat a character's systems to earn respect. {join}+ and they join you; " +
      '{withdraw}+ and they pull their defenses off the whole city!',
    ro:
      'Învinge sistemele unui personaj ca să câștigi respect. {join}+ și ți se alătură; ' +
      '{withdraw}+ și își retrag apărările din tot orașul!',
  },
  'roster.map.0': { en: 'Starter', ro: 'De început' },
  'roster.map.1': { en: 'Street Grid', ro: 'Rețeaua Stradală' },
  'roster.map.2': { en: 'Metro Net', ro: 'Rețeaua de Metrou' },
  'roster.map.3': { en: 'Sky Core', ro: 'Nucleul Cerului' },
  'roster.badge.starter': {
    en: 'On your crew from day one',
    ro: 'În echipajul tău din prima zi',
  },
  'roster.badge.withdrawn': { en: 'Defenses withdrawn!', ro: 'Apărări retrase!' },
  'roster.badge.joined': { en: 'On your crew', ro: 'În echipajul tău' },
  'roster.badge.respect': {
    en: 'Respect {respect}/{join} to join',
    ro: 'Respect {respect}/{join} pentru a se alătura',
  },
  'roster.joinsAt': { en: 'Joins at {n}', ro: 'Se alătură la {n}' },
  'roster.withdrawsAt': { en: 'Withdraws at {n}', ro: 'Se retrage la {n}' },

  // --- Team picker -----------------------------------------------------------
  'team.title': { en: 'Assemble your team', ro: 'Formează-ți echipa' },
  'team.vs': { en: 'vs {names}', ro: 'vs {names}' },
  'team.critical': { en: 'critical system', ro: 'sistem critic' },
  'team.restoreStreet': { en: 'Restore Street Grid', ro: 'Restaurează Rețeaua Stradală' },
  'team.restoreMetro': { en: 'Restore Metro Net', ro: 'Restaurează Rețeaua de Metrou' },
  'team.emptySeat': { en: 'Empty seat', ro: 'Loc gol' },
  'team.powers': { en: 'Team powers:', ro: 'Puterile echipei:' },
  'team.noPowers': {
    en: 'none — any power can appear',
    ro: 'niciuna — orice putere poate apărea',
  },
  'team.startBattle': { en: 'Start battle ({count}/{seats})', ro: 'Începe lupta ({count}/{seats})' },

  // --- Campaign map ----------------------------------------------------------
  'campaign.systems': { en: 'Systems', ro: 'Sisteme' },
  'campaign.criticalSecured': {
    en: '{cleared}/{total} critical systems secured',
    ro: '{cleared}/{total} sisteme critice securizate',
  },
  'campaign.nextSystem': { en: 'Next system', ro: 'Sistemul următor' },
  'campaign.preview.critical': { en: 'Critical system', ro: 'Sistem critic' },
  'campaign.preview.glitched': { en: 'Glitched system', ro: 'Sistem defect' },
  'campaign.preview.alreadyRestored': {
    en: 'Already restored — win cleaner to improve your respect (best result counts).',
    ro: 'Deja restaurat — câștigă mai curat ca să-ți mărești respectul (contează cel mai bun rezultat).',
  },
  'campaign.preview.nobodyDefending': {
    en: 'Nobody is defending this system any more.',
    ro: 'Nimeni nu mai apără acest sistem.',
  },
  'campaign.fixIt': { en: 'Fix it!', ro: 'Repar-o!' },
  'campaign.auto': { en: 'auto', ro: 'auto' },
  // Toasts
  'toast.systemRestored': {
    en: 'System restored! +{respect} respect{suffix}',
    ro: 'Sistem restaurat! +{respect} respect{suffix}',
  },
  'toast.bestKept': { en: ' (best kept)', ro: ' (păstrat cel mai bun)' },
  'toast.joined': { en: '{name} joined your crew!', ro: '{name} s-a alăturat echipajului tău!' },
  'toast.withdrew': {
    en: '{name} pulled their defenses off the city!',
    ro: '{name} și-a retras apărările din oraș!',
  },
  'toast.autoRestoredOne': {
    en: '{count} undefended system came back online!',
    ro: '{count} sistem neapărat a revenit online!',
  },
  'toast.autoRestoredMany': {
    en: '{count} undefended systems came back online!',
    ro: '{count} sisteme neapărate au revenit online!',
  },
  'toast.coreDone': {
    en: 'The AI Core is yours — Neon City reboots!',
    ro: 'Nucleul AI e al tău — Neon City repornește!',
  },
  'toast.mapRestored': {
    en: '{map} fully restored — new system and battle seat unlocked!',
    ro: '{map} complet restaurat — sistem nou și loc de luptă deblocate!',
  },

  // --- Share -----------------------------------------------------------------
  'share.chip': { en: 'Share', ro: 'Trimite' },
  'share.heading': { en: 'Share the game', ro: 'Trimite jocul' },
  'share.scan': {
    en: 'Scan this code with a phone camera to jump straight into Neon City.',
    ro: 'Scanează acest cod cu camera telefonului ca să intri direct în Neon City.',
  },
  'share.text': {
    en: 'Come play Neon City: Bug Busters with me! 🤖⚡',
    ro: 'Vino să joci Neon City: Bug Busters cu mine! 🤖⚡',
  },
  'share.shareBtn': { en: 'Share…', ro: 'Trimite…' },
  'share.copy': { en: 'Copy link', ro: 'Copiază linkul' },
  'share.copied': { en: 'Link copied!', ro: 'Link copiat!' },

  // --- Combat ----------------------------------------------------------------
  'combat.moves': { en: 'Moves', ro: 'Mutări' },
  'combat.turn': { en: '{name} Turn', ro: 'Tura lui {name}' },
  'combat.wins': { en: '{name} Wins!', ro: '{name} câștigă!' },
  'combat.placing': { en: 'Placing piece...', ro: 'Se așază piesa...' },
  'combat.opponentTurn': { en: "Opponent's turn", ro: 'Tura adversarului' },
  'combat.exitToMap': { en: 'Back to Map', ro: 'Înapoi la hartă' },
  'combat.exitToMenu': { en: 'Back to Menu', ro: 'Înapoi la meniu' },
  'combat.you': { en: 'You', ro: 'Tu' },
  'combat.rival': { en: 'Rival', ro: 'Rival' },
  'combat.gotIt': { en: 'Got it!', ro: 'Am înțeles!' },
  'combat.skipLessons': { en: 'Skip lessons', ro: 'Sari peste lecții' },
  'combat.use': { en: 'Use', ro: 'Folosește' },
  'combat.recharging': { en: 'Recharging…', ro: 'Se reîncarcă…' },
  'combat.pass': { en: 'Pass', ro: 'Pasează' },
  'combat.ai': { en: 'AI', ro: 'AI' },
  'combat.battleLog': { en: 'Battle Log', ro: 'Jurnal de luptă' },
  'combat.nothingYet': { en: 'Nothing has happened yet!', ro: 'Încă nu s-a întâmplat nimic!' },
  'combat.yourTurn': { en: 'Your Turn!', ro: 'Tura ta!' },
  'combat.fairStart': {
    en: 'Fair start: your first turn places a piece — perks unlock next turn!',
    ro: 'Start corect: prima ta tură așază o piesă — puterile se deblochează tura următoare!',
  },
  'combat.ready': { en: 'Ready!', ro: 'Gata!' },
  'combat.lane': { en: 'Lane {n}', ro: 'Linia {n}' },
  'combat.laneChecked': { en: 'Lane {n} ✓', ro: 'Linia {n} ✓' },
  'combat.effects': { en: '{count} effects', ro: '{count} efecte' },
  'combat.hiddenBy': { en: 'Hidden by {power}', ro: 'Ascuns de {power}' },
  'combat.side.own': { en: 'Your side', ro: 'Partea ta' },
  'combat.side.enemy': { en: 'Enemy side', ro: 'Partea inamicului' },
  'combat.side.both': { en: 'Whole line', ro: 'Toată linia' },
  'combat.p1turn': { en: 'Player 1 turn', ro: 'Tura jucătorului 1' },
  'combat.p2turn': { en: 'Player 2 turn', ro: 'Tura jucătorului 2' },
  'combat.descNext': { en: '{desc}. Next: tap a lane.', ro: '{desc}. Apoi: atinge o linie.' },
  // Targeting hints
  'combat.where.own': { en: 'on your side', ro: 'pe partea ta' },
  'combat.where.enemy': { en: 'on the enemy side', ro: 'pe partea inamicului' },
  'combat.where.both': { en: 'on the board', ro: 'pe tablă' },
  'combat.aim.first': { en: 'Tap the first lane {where}', ro: 'Atinge prima linie {where}' },
  'combat.aim.second': {
    en: 'Tap the second lane {where} (Lane {n} picked)',
    ro: 'Atinge a doua linie {where} (Linia {n} aleasă)',
  },
  'combat.aim.single': { en: 'Tap a glowing lane {where}', ro: 'Atinge o linie strălucitoare {where}' },
  // Tutorial coach marks
  'tut.sides.title': { en: 'Welcome to the Grid!', ro: 'Bun venit în Rețea!' },
  'tut.sides.text': {
    en: 'Fill a line with 5 bots to fix it!',
    ro: 'Umple o linie cu 5 roboți ca să o repari!',
  },
  'tut.deploy.title': { en: 'Auto-Deploy!', ro: 'Așezare automată!' },
  'tut.deploy.text': {
    en: 'A bot lands by itself every turn.',
    ro: 'Un robot se așază singur în fiecare tură.',
  },
  'tut.power.title': { en: 'Pick a Power!', ro: 'Alege o putere!' },
  'tut.power.text': {
    en: 'Tap a picture to see what it does.',
    ro: 'Atinge o imagine ca să vezi ce face.',
  },
  'tut.win.title': { en: 'Line Fixed!', ro: 'Linie reparată!' },
  'tut.win.text': {
    en: 'Fix 3 lines to win the battle!',
    ro: 'Repară 3 linii ca să câștigi bătălia!',
  },
};
