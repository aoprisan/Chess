/// Available heroes in Kiddie Chess
enum HeroType {
  sloth,
  panda,
  unicorn,
  snowman,
  gnom,
  yeti,
}

/// Special abilities each hero can use
enum Perk {
  anotherMove,    // Take an extra turn
  removeEnemy,    // Remove an enemy piece
  placeAnother,   // Place an additional piece
  scatterAround,  // Reposition pieces randomly
  freeze,         // Freeze opponent for one turn
  cancelMove,     // Undo last move
}

class Hero {
  final HeroType type;
  final String name;
  final String imagePath;
  final List<Perk> perks;
  final Map<Perk, int> perkCounts; // How many times each perk can be used

  const Hero({
    required this.type,
    required this.name,
    required this.imagePath,
    required this.perks,
    required this.perkCounts,
  });

  static const List<Hero> allHeroes = [
    Hero(
      type: HeroType.sloth,
      name: 'Sloth',
      imagePath: 'assets/images/characters/sloth.png',
      perks: [Perk.freeze, Perk.cancelMove],
      perkCounts: {Perk.freeze: 2, Perk.cancelMove: 1},
    ),
    Hero(
      type: HeroType.panda,
      name: 'Panda',
      imagePath: 'assets/images/characters/panda.png',
      perks: [Perk.anotherMove, Perk.removeEnemy],
      perkCounts: {Perk.anotherMove: 2, Perk.removeEnemy: 1},
    ),
    Hero(
      type: HeroType.unicorn,
      name: 'Unicorn',
      imagePath: 'assets/images/characters/unicorn.png',
      perks: [Perk.scatterAround, Perk.placeAnother],
      perkCounts: {Perk.scatterAround: 1, Perk.placeAnother: 2},
    ),
    Hero(
      type: HeroType.snowman,
      name: 'Snowman',
      imagePath: 'assets/images/characters/snowman.png',
      perks: [Perk.freeze, Perk.anotherMove],
      perkCounts: {Perk.freeze: 2, Perk.anotherMove: 1},
    ),
    Hero(
      type: HeroType.gnom,
      name: 'Gnom',
      imagePath: 'assets/images/characters/gnom.png',
      perks: [Perk.removeEnemy, Perk.cancelMove],
      perkCounts: {Perk.removeEnemy: 2, Perk.cancelMove: 1},
    ),
    Hero(
      type: HeroType.yeti,
      name: 'Yeti',
      imagePath: 'assets/images/characters/yeti.png',
      perks: [Perk.placeAnother, Perk.scatterAround],
      perkCounts: {Perk.placeAnother: 2, Perk.scatterAround: 1},
    ),
  ];

  String get perkDescription {
    return perks.map((p) => _perkName(p)).join(', ');
  }

  static String _perkName(Perk perk) {
    switch (perk) {
      case Perk.anotherMove:
        return 'Another Move';
      case Perk.removeEnemy:
        return 'Remove Enemy';
      case Perk.placeAnother:
        return 'Place Another';
      case Perk.scatterAround:
        return 'Scatter Around';
      case Perk.freeze:
        return 'Freeze';
      case Perk.cancelMove:
        return 'Cancel Move';
    }
  }
}
