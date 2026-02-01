import 'package:flutter_test/flutter_test.dart';
import 'package:kiddie_chess/models/hero.dart';

void main() {
  group('HeroType', () {
    test('has all expected types', () {
      expect(HeroType.values.length, equals(6));
      expect(HeroType.values, contains(HeroType.sloth));
      expect(HeroType.values, contains(HeroType.panda));
      expect(HeroType.values, contains(HeroType.unicorn));
      expect(HeroType.values, contains(HeroType.snowman));
      expect(HeroType.values, contains(HeroType.gnom));
      expect(HeroType.values, contains(HeroType.yeti));
    });
  });

  group('Perk', () {
    test('has all expected perks', () {
      expect(Perk.values.length, equals(6));
      expect(Perk.values, contains(Perk.anotherMove));
      expect(Perk.values, contains(Perk.removeEnemy));
      expect(Perk.values, contains(Perk.placeAnother));
      expect(Perk.values, contains(Perk.scatterAround));
      expect(Perk.values, contains(Perk.freeze));
      expect(Perk.values, contains(Perk.cancelMove));
    });
  });

  group('Hero', () {
    test('allHeroes contains 6 heroes', () {
      expect(Hero.allHeroes.length, equals(6));
    });

    test('each hero has unique type', () {
      final types = Hero.allHeroes.map((h) => h.type).toSet();
      expect(types.length, equals(6));
    });

    test('each hero has a name', () {
      for (final hero in Hero.allHeroes) {
        expect(hero.name, isNotEmpty);
      }
    });

    test('each hero has an image path', () {
      for (final hero in Hero.allHeroes) {
        expect(hero.imagePath, startsWith('assets/images/characters/'));
        expect(hero.imagePath, endsWith('.png'));
      }
    });

    test('each hero has at least one perk', () {
      for (final hero in Hero.allHeroes) {
        expect(hero.perks, isNotEmpty);
      }
    });

    test('each hero has perk counts for all their perks', () {
      for (final hero in Hero.allHeroes) {
        for (final perk in hero.perks) {
          expect(hero.perkCounts.containsKey(perk), isTrue,
              reason: '${hero.name} should have count for ${perk.name}');
          expect(hero.perkCounts[perk], greaterThan(0));
        }
      }
    });

    group('Sloth', () {
      final sloth = Hero.allHeroes.firstWhere((h) => h.type == HeroType.sloth);

      test('has correct name', () {
        expect(sloth.name, equals('Sloth'));
      });

      test('has freeze and cancelMove perks', () {
        expect(sloth.perks, contains(Perk.freeze));
        expect(sloth.perks, contains(Perk.cancelMove));
      });

      test('has correct perk counts', () {
        expect(sloth.perkCounts[Perk.freeze], equals(2));
        expect(sloth.perkCounts[Perk.cancelMove], equals(1));
      });
    });

    group('Panda', () {
      final panda = Hero.allHeroes.firstWhere((h) => h.type == HeroType.panda);

      test('has correct name', () {
        expect(panda.name, equals('Panda'));
      });

      test('has anotherMove and removeEnemy perks', () {
        expect(panda.perks, contains(Perk.anotherMove));
        expect(panda.perks, contains(Perk.removeEnemy));
      });

      test('has correct perk counts', () {
        expect(panda.perkCounts[Perk.anotherMove], equals(2));
        expect(panda.perkCounts[Perk.removeEnemy], equals(1));
      });
    });

    group('Unicorn', () {
      final unicorn =
          Hero.allHeroes.firstWhere((h) => h.type == HeroType.unicorn);

      test('has correct name', () {
        expect(unicorn.name, equals('Unicorn'));
      });

      test('has scatterAround and placeAnother perks', () {
        expect(unicorn.perks, contains(Perk.scatterAround));
        expect(unicorn.perks, contains(Perk.placeAnother));
      });

      test('has correct perk counts', () {
        expect(unicorn.perkCounts[Perk.scatterAround], equals(1));
        expect(unicorn.perkCounts[Perk.placeAnother], equals(2));
      });
    });

    group('Snowman', () {
      final snowman =
          Hero.allHeroes.firstWhere((h) => h.type == HeroType.snowman);

      test('has correct name', () {
        expect(snowman.name, equals('Snowman'));
      });

      test('has freeze and anotherMove perks', () {
        expect(snowman.perks, contains(Perk.freeze));
        expect(snowman.perks, contains(Perk.anotherMove));
      });

      test('has correct perk counts', () {
        expect(snowman.perkCounts[Perk.freeze], equals(2));
        expect(snowman.perkCounts[Perk.anotherMove], equals(1));
      });
    });

    group('Gnom', () {
      final gnom = Hero.allHeroes.firstWhere((h) => h.type == HeroType.gnom);

      test('has correct name', () {
        expect(gnom.name, equals('Gnom'));
      });

      test('has removeEnemy and cancelMove perks', () {
        expect(gnom.perks, contains(Perk.removeEnemy));
        expect(gnom.perks, contains(Perk.cancelMove));
      });

      test('has correct perk counts', () {
        expect(gnom.perkCounts[Perk.removeEnemy], equals(2));
        expect(gnom.perkCounts[Perk.cancelMove], equals(1));
      });
    });

    group('Yeti', () {
      final yeti = Hero.allHeroes.firstWhere((h) => h.type == HeroType.yeti);

      test('has correct name', () {
        expect(yeti.name, equals('Yeti'));
      });

      test('has placeAnother and scatterAround perks', () {
        expect(yeti.perks, contains(Perk.placeAnother));
        expect(yeti.perks, contains(Perk.scatterAround));
      });

      test('has correct perk counts', () {
        expect(yeti.perkCounts[Perk.placeAnother], equals(2));
        expect(yeti.perkCounts[Perk.scatterAround], equals(1));
      });
    });

    group('perkDescription', () {
      test('returns comma-separated perk names', () {
        final sloth = Hero.allHeroes.firstWhere((h) => h.type == HeroType.sloth);
        final description = sloth.perkDescription;

        expect(description, contains('Freeze'));
        expect(description, contains('Cancel Move'));
        expect(description, contains(', '));
      });

      test('all perks have descriptive names', () {
        for (final hero in Hero.allHeroes) {
          final description = hero.perkDescription;
          expect(description, isNotEmpty);
          // Should not contain enum-style names
          expect(description.contains('anotherMove'), isFalse);
          expect(description.contains('removeEnemy'), isFalse);
        }
      });
    });
  });
}
