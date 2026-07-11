import { PerkInfo } from '../../game/perks';
import { Icon } from '../Icons';
import { perkIcon } from '../perkTheme';
import { useLang, useT, perkName } from '../../i18n';
import { clamp, DUAL_LANE_PERKS, sideStyleFor } from './theme';

// --- Targeting hint (below the board, replaces the perk panel while aiming) -----

export function TargetingHint({
  W,
  perkId,
  info,
  firstSelectedLane,
  onCancel,
}: {
  W: number;
  perkId: number;
  info: PerkInfo;
  firstSelectedLane: number | null;
  onCancel: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const style = sideStyleFor(perkId, info);
  const where =
    info.targetSide === 'own'
      ? t('combat.where.own')
      : info.targetSide === 'enemy'
        ? t('combat.where.enemy')
        : t('combat.where.both');
  const instruction = DUAL_LANE_PERKS.has(perkId)
    ? firstSelectedLane === null
      ? t('combat.aim.first', { where })
      : t('combat.aim.second', { where, n: firstSelectedLane + 1 })
    : t('combat.aim.single', { where });

  return (
    <div
      className="perk-bar"
      style={{
        padding: `${clamp(W * 0.01, 8, 14)}px ${clamp(W * 0.02, 12, 20)}px`,
        border: `2px solid ${style.border}`,
        boxShadow: `0 0 8px 1px ${style.fill}`,
      }}
    >
      <Icon name={perkIcon(perkId)} size={clamp(W * 0.022, 16, 24)} color={style.border} />
      <div className="info">
        <span className="name" style={{ fontSize: clamp(W * 0.016, 12, 18) }}>
          {perkName(info, lang)}
        </span>
        <span
          className="hint"
          style={{ fontSize: clamp(W * 0.016, 12, 18) * 0.85, color: style.border }}
        >
          {instruction}
        </span>
      </div>
      <button className="bar-btn cancel" onClick={onCancel}>
        <Icon name="close" size={14} color="#fff" />
        {t('common.cancel')}
      </button>
    </div>
  );
}
