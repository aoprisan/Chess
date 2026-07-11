import { getPerk } from '../../game/perks';
import { CombatGameState } from '../../game/state';
import { Icon } from '../Icons';
import { perkIcon } from '../perkTheme';
import { useLang, useT, perkName } from '../../i18n';
import { DUAL_LANE_PERKS, sideStyleFor } from './theme';

// --- Lane selection overlays ----------------------------------------------------

export function LaneSelection({
  state,
  selectedPerkId,
  firstSelectedLane,
  validLanes,
  cellH,
  halfW,
  bw,
  onLaneClick,
}: {
  state: CombatGameState;
  selectedPerkId: number;
  firstSelectedLane: number | null;
  validLanes: number[];
  cellH: number;
  halfW: number;
  bw: number;
  onLaneClick: (i: number) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const me = state.currentPlayer;
  const info = getPerk(selectedPerkId);
  const label = info ? perkName(info, lang) : '';
  const side = info?.targetSide ?? 'both';
  const style = sideStyleFor(selectedPerkId, info);
  const icon = perkIcon(selectedPerkId);

  // Player 1 always owns the left half of the board, player 2 the right.
  const highlightLeft =
    side === 'own'
      ? me === 'player1'
        ? 0
        : halfW
      : side === 'enemy'
        ? me === 'player1'
          ? halfW
          : 0
        : 0;
  const highlightWidth = side === 'both' ? bw : halfW;

  return (
    <>
      {state.lanes.map((lane, i) => {
        if (lane.winner) return null;

        if (firstSelectedLane === i && DUAL_LANE_PERKS.has(selectedPerkId)) {
          // First selected lane of a dual-lane perk, on the half the perk affects
          return (
            <div
              key={i}
              className="lane-overlay"
              style={{
                left: highlightLeft,
                top: i * cellH,
                width: highlightWidth,
                height: cellH,
                background: 'rgba(255,152,0,0.35)',
                border: '3px solid #FFA726',
                boxShadow: '0 0 8px 1px rgba(255,152,0,0.4)',
              }}
            >
              <div className="pill-center">
                <span className="lane-pill" style={{ background: 'rgba(245,124,0,0.9)' }}>
                  <Icon name="check" size={14} color="#fff" />
                  {t('combat.laneChecked', { n: i + 1 })}
                </span>
              </div>
            </div>
          );
        }

        if (!validLanes.includes(i)) {
          return (
            <div
              key={i}
              className="lane-overlay"
              style={{
                left: 0,
                top: i * cellH,
                width: bw,
                height: cellH,
                background: 'rgba(158,158,158,0.15)',
              }}
            />
          );
        }

        // Highlight only the half of the lane the perk affects.
        return (
          <div
            key={i}
            className="lane-overlay tappable"
            style={{
              left: highlightLeft,
              top: i * cellH,
              width: highlightWidth,
              height: cellH,
              background: style.fill,
              border: `3px solid ${style.border}`,
              boxShadow: `0 0 8px 1px ${style.fill}`,
            }}
            onClick={() => onLaneClick(i)}
          >
            <div className="pill-center">
              <span className="lane-pill" style={{ background: style.pill }}>
                <Icon name={icon} size={14} color="#fff" />
                {label} {i + 1}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
