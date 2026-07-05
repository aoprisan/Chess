import { describe, it, expect } from 'vitest';
import { PERKS } from '../game/perks';
import { PERK_ICON, perkIcon } from './perkTheme';
import { PERK_PICTO } from './PerkPicto';
import { ICON_NAMES } from './Icons';

// The 8-11 target group can't all read fast: every power must be
// recognizable by a picture alone, so each perk gets its own glyph.
describe('per-perk icons', () => {
  it('assigns a glyph to every perk in the catalog', () => {
    for (const perk of Object.values(PERKS)) {
      expect(PERK_ICON[perk.id], `perk ${perk.id} (${perk.name}) has no icon`).toBeDefined();
    }
  });

  it('gives every perk a distinct glyph', () => {
    const byIcon = new Map<string, number[]>();
    for (const [id, icon] of Object.entries(PERK_ICON)) {
      byIcon.set(icon, [...(byIcon.get(icon) ?? []), Number(id)]);
    }
    for (const [icon, ids] of byIcon) {
      expect(ids, `icon "${icon}" is shared by perks ${ids.join(', ')}`).toHaveLength(1);
    }
  });

  it('only references glyphs that exist in the icon set', () => {
    for (const [id, icon] of Object.entries(PERK_ICON)) {
      expect(ICON_NAMES, `perk ${id} points at missing icon "${icon}"`).toContain(icon);
    }
    expect(perkIcon(9999)).toBe('build'); // unknown ids fall back to the utility glyph
  });
});

describe('kid readability', () => {
  it('gives every perk a pictogram phrase of real glyphs', () => {
    for (const perk of Object.values(PERKS)) {
      const tokens = PERK_PICTO[perk.id];
      expect(tokens, `perk ${perk.id} (${perk.name}) has no pictogram`).toBeDefined();
      expect(tokens.length, `perk ${perk.id} pictogram is empty`).toBeGreaterThan(0);
      for (const tok of tokens) {
        if (tok.icon) {
          expect(ICON_NAMES, `perk ${perk.id} pictogram uses missing icon`).toContain(tok.icon);
        }
        expect(tok.icon || tok.text, `perk ${perk.id} has a blank pictogram chip`).toBeTruthy();
      }
    }
  });

  it('keeps every description at 5 words or fewer', () => {
    for (const perk of Object.values(PERKS)) {
      const words = perk.description.trim().split(/\s+/);
      expect(
        words.length,
        `"${perk.name}" description is ${words.length} words: "${perk.description}"`,
      ).toBeLessThanOrEqual(5);
    }
  });
});
