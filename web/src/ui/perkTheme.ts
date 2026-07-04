// Perk category colors/icons shared by the combat perk bar and the
// How to Play catalog.

import { PerkCategory } from '../game/perks';
import { IconName } from './Icons';

export const CATEGORY_COLOR: Record<PerkCategory, string> = {
  offensive: '#ff2fd6', // neon magenta
  defensive: '#00e5ff', // neon cyan
  utility: '#3dff8f', // neon lime
};

export const CATEGORY_ICON: Record<PerkCategory, IconName> = {
  offensive: 'flash',
  defensive: 'shield',
  utility: 'build',
};
