import { describe, expect, it } from 'vitest';
import { ALL_HEROES } from '../game/hero';
import { heroImage, ui } from './assets';
import { AssetGroup, groupUrls } from './preload';

const ALL_GROUPS: AssetGroup[] = ['menu', 'heroes', 'combat', 'adventure'];

describe('preload groups', () => {
  it('covers every ui chrome asset, so new art cannot silently skip preloading', () => {
    const all = new Set(groupUrls(ALL_GROUPS));
    for (const [name, url] of Object.entries(ui)) {
      expect(all.has(url), `ui.${name} (${url}) is not in any preload group`).toBe(true);
    }
  });

  it('covers every hero image', () => {
    const all = new Set(groupUrls(ALL_GROUPS));
    for (const hero of ALL_HEROES) {
      expect(all.has(heroImage(hero.imagePath)), `${hero.name} image missing`).toBe(true);
    }
  });

  it('deduplicates urls across groups', () => {
    const urls = groupUrls(ALL_GROUPS);
    expect(urls.length).toBe(new Set(urls).size);
  });
});
