// Heroes — ported from client/lib/models/hero.dart. Purely cosmetic
// (name + image); they have no stats or per-hero mechanics.

export type HeroType = 'sloth' | 'panda' | 'unicorn' | 'snowman' | 'gnom' | 'yeti';

export interface Hero {
  type: HeroType;
  name: string;
  imagePath: string;
}

export const ALL_HEROES: Hero[] = [
  { type: 'sloth', name: 'Sloth', imagePath: 'assets/images/characters/sloth.png' },
  { type: 'panda', name: 'Panda', imagePath: 'assets/images/characters/panda.png' },
  { type: 'unicorn', name: 'Unicorn', imagePath: 'assets/images/characters/unicorn.png' },
  { type: 'snowman', name: 'Snowman', imagePath: 'assets/images/characters/snowman.png' },
  { type: 'gnom', name: 'Gnom', imagePath: 'assets/images/characters/gnom.png' },
  { type: 'yeti', name: 'Yeti', imagePath: 'assets/images/characters/yeti.png' },
];

export function heroByType(type: HeroType): Hero {
  return ALL_HEROES.find((h) => h.type === type)!;
}
