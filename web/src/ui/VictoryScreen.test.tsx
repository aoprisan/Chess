// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VictoryScreen } from './VictoryScreen';
import { LanguageProvider } from '../i18n';
import { CampaignController } from '../campaign/controller';
import { CampaignMapDef, CampaignMapId, CampaignMapJson } from '../campaign/model';

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

// Minimal three-map campaign: each map is a lone entry node.
function testMaps(): Record<CampaignMapId, CampaignMapDef> {
  const mapJson = (id: CampaignMapId): CampaignMapJson => ({
    id,
    name: `Test ${id}`,
    heightFactor: 1,
    entryNodeId: 'e',
    nodes: [
      {
        id: 'e',
        kind: 'entry',
        critical: false,
        defenders: [],
        difficulty: 'medium',
        x: 0.5,
        y: 0.5,
        district: 'test',
        connections: [],
      },
    ],
  });
  return {
    map_1: new CampaignMapDef(mapJson('map_1')),
    map_2: new CampaignMapDef(mapJson('map_2')),
    map_3: new CampaignMapDef(mapJson('map_3')),
  };
}

function renderVictory(onClose = vi.fn()) {
  const controller = new CampaignController(testMaps());
  render(
    <LanguageProvider>
      <VictoryScreen controller={controller} onClose={onClose} />
    </LanguageProvider>,
  );
  return onClose;
}

describe('VictoryScreen', () => {
  it('celebrates in English and shows the crew', () => {
    renderVictory();
    expect(screen.getByText('Neon City reboots!')).toBeTruthy();
    expect(screen.getByText(/Your crew of 5 Fixers/)).toBeTruthy();
  });

  it('celebrates in Romanian', () => {
    localStorage.setItem('neon_lang_v1', 'ro');
    renderVictory();
    expect(screen.getByText('Neon City repornește!')).toBeTruthy();
    expect(screen.getByText(/Echipajul tău de 5 Fixeri/)).toBeTruthy();
  });

  it('dismisses via the back button and the scrim', () => {
    const onClose = renderVictory();
    fireEvent.click(screen.getByText('Back to the city'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
