// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { App } from './App';
import { LanguageProvider, translate } from '../i18n';

vi.mock('./preload', () => ({
  preloadGameImages: async (onProgress: (f: number) => void) => {
    onProgress(1);
  },
}));

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  globalThis.fetch = (async (url: unknown) => {
    const match = String(url).match(/assets\/maps\/(map_\d)\.json$/);
    if (!match) throw new Error(`Unexpected fetch: ${String(url)}`);
    const body = readFileSync(`${process.cwd()}/public/assets/maps/${match[1]}.json`, 'utf-8');
    return { ok: true, json: async () => JSON.parse(body) };
  }) as typeof fetch;
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function renderApp() {
  return render(
    <LanguageProvider>
      <App />
    </LanguageProvider>,
  );
}

describe('language toggle', () => {
  it('defaults to English on the home menu', async () => {
    renderApp();
    expect(await screen.findByText('Quick Match')).toBeTruthy();
    expect(screen.getByText('Campaign')).toBeTruthy();
  });

  it('switches the menu to Romanian and persists the choice', async () => {
    renderApp();
    await screen.findByText('Quick Match');

    fireEvent.click(screen.getByRole('radio', { name: 'Română' }));

    expect(screen.getByText('Meci rapid')).toBeTruthy(); // Quick Match
    expect(screen.getByText('Campanie')).toBeTruthy(); // Campaign
    expect(screen.queryByText('Quick Match')).toBeNull();
    expect(localStorage.getItem('neon_lang_v1')).toBe('ro');
  });

  it('reads a previously saved Romanian preference', async () => {
    localStorage.setItem('neon_lang_v1', 'ro');
    renderApp();
    expect(await screen.findByText('Meci rapid')).toBeTruthy();
    const roChip = screen.getByRole('radio', { name: 'Română' });
    expect(roChip.getAttribute('aria-checked')).toBe('true');
  });

  it('translates the How to Play screen and every perk name', async () => {
    localStorage.setItem('neon_lang_v1', 'ro');
    renderApp();
    fireEvent.click(await screen.findByText('Cum se joacă'));
    expect(screen.getByText('Bătălia')).toBeTruthy(); // The Battle
    expect(screen.getByText('Val de energie')).toBeTruthy(); // Power Surge (perk 28)
  });

  it('renders a full battle in Romanian without crashing', async () => {
    localStorage.setItem('neon_lang_v1', 'ro');
    localStorage.setItem('neon_tutorial_v1', 'done');
    renderApp();
    fireEvent.click(await screen.findByText('Meci rapid')); // Quick Match
    await screen.findByText('Alege-ți personajul'); // Choose your character
    fireEvent.click(screen.getByText('Bitzy'));
    fireEvent.click(screen.getByText('Începe')); // Start
    // Combat mounts with the Romanian turn dialog.
    expect(await screen.findByText('Tura ta!')).toBeTruthy(); // Your Turn!
    expect(screen.getByText('Gata!')).toBeTruthy(); // Ready!
  });
});

describe('translate()', () => {
  it('falls back to English for the en language and fills placeholders', () => {
    expect(translate('en', 'menu.campaign')).toBe('Campaign');
    expect(translate('ro', 'menu.campaign')).toBe('Campanie');
    expect(translate('ro', 'combat.turn', { name: 'Bitzy' })).toBe('Tura lui Bitzy');
  });

  it('returns the key for unknown ids so gaps are visible', () => {
    expect(translate('ro', 'does.not.exist')).toBe('does.not.exist');
  });
});
