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

    group('Sloth', () {
      final sloth = Hero.allHeroes.firstWhere((h) => h.type == HeroType.sloth);

      test('has correct name', () {
        expect(sloth.name, equals('Sloth'));
      });
    });

    group('Panda', () {
      final panda = Hero.allHeroes.firstWhere((h) => h.type == HeroType.panda);

      test('has correct name', () {
        expect(panda.name, equals('Panda'));
      });
    });

    group('Unicorn', () {
      final unicorn =
          Hero.allHeroes.firstWhere((h) => h.type == HeroType.unicorn);

      test('has correct name', () {
        expect(unicorn.name, equals('Unicorn'));
      });
    });

    group('Snowman', () {
      final snowman =
          Hero.allHeroes.firstWhere((h) => h.type == HeroType.snowman);

      test('has correct name', () {
        expect(snowman.name, equals('Snowman'));
      });
    });

    group('Gnom', () {
      final gnom = Hero.allHeroes.firstWhere((h) => h.type == HeroType.gnom);

      test('has correct name', () {
        expect(gnom.name, equals('Gnom'));
      });
    });

    group('Yeti', () {
      final yeti = Hero.allHeroes.firstWhere((h) => h.type == HeroType.yeti);

      test('has correct name', () {
        expect(yeti.name, equals('Yeti'));
      });
    });
  });
}
