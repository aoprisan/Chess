/// Available heroes in Kiddie Chess
enum HeroType {
  sloth,
  panda,
  unicorn,
  snowman,
  gnom,
  yeti,
}

class Hero {
  final HeroType type;
  final String name;
  final String imagePath;

  const Hero({
    required this.type,
    required this.name,
    required this.imagePath,
  });

  static const List<Hero> allHeroes = [
    Hero(
      type: HeroType.sloth,
      name: 'Sloth',
      imagePath: 'assets/images/characters/sloth.png',
    ),
    Hero(
      type: HeroType.panda,
      name: 'Panda',
      imagePath: 'assets/images/characters/panda.png',
    ),
    Hero(
      type: HeroType.unicorn,
      name: 'Unicorn',
      imagePath: 'assets/images/characters/unicorn.png',
    ),
    Hero(
      type: HeroType.snowman,
      name: 'Snowman',
      imagePath: 'assets/images/characters/snowman.png',
    ),
    Hero(
      type: HeroType.gnom,
      name: 'Gnom',
      imagePath: 'assets/images/characters/gnom.png',
    ),
    Hero(
      type: HeroType.yeti,
      name: 'Yeti',
      imagePath: 'assets/images/characters/yeti.png',
    ),
  ];
}
