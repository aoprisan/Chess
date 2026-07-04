// Perk category colors/icons shared by the combat perk bar and the
// How to Play catalog.

import { PerkCategory } from '../game/perks';
import { IconName } from './Icons';

export const CATEGORY_COLOR: Record<PerkCategory, string> = {
  offensive: '#EF5350', // red.shade400
  defensive: '#42A5F5', // blue.shade400
  utility: '#FFCA28', // amber.shade400
};

export const CATEGORY_ICON: Record<PerkCategory, IconName> = {
  offensive: 'flash',
  defensive: 'shield',
  utility: 'build',
};
