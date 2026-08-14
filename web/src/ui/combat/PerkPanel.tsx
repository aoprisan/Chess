import { getPerk, PerkInfo, PerkSlot } from '../../game/perks';
import { Character } from '../../game/characters';
import { CharacterPortrait } from '../CharacterPortrait';
import { Icon } from '../Icons';
import { CATEGORY_COLOR, perkIcon } from '../perkTheme';
import { PerkPicto } from '../PerkPicto';
import { useLang, useT, perkName, perkDescription } from '../../i18n';
import { SIDE_CHIP_COLOR, SIDE_LABEL_KEY } from './theme';

// --- Perk panel -----------------------------------------------------------------

export function PerkPanel({
  slots,
  owners,
  disabled,
  aiHighlight,
  selectedPerkId,
  selectedInfo,
  allowedPerkIds,
  allowPass = true,
  highlightPerkId = null,
  highlightConfirm = false,
  onPerk,
  onPass,
  onConfirm,
  onCancel,
}: {
  slots: PerkSlot[];
  /** Campaign battles: the seated team, for "whose perk is this" tags. */
  owners?: Character[];
  disabled: boolean;
  aiHighlight: number | null;
  selectedPerkId: number | null;
  selectedInfo?: PerkInfo;
  /** Tutorial gate: only these powers are tappable (undefined = all of them). */
  allowedPerkIds?: number[];
  allowPass?: boolean;
  /** Tutorial: the power the coach bar is pointing at. */
  highlightPerkId?: number | null;
  highlightConfirm?: boolean;
  onPerk: (perkId: number) => void;
  onPass: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const aiMode = aiHighlight !== null;
  const gated = (perkId: number) =>
    allowedPerkIds !== undefined && !allowedPerkIds.includes(perkId);
  const ownerOf = (perkId: number): Character | undefined =>
    owners?.find((c) => c.perkIds.includes(perkId));
  return (
    <div className={`perk-panel column${aiMode ? ' ai' : ''}`}>
      {/* Inline explanation of the selected perk, right where the player
          tapped — no separate top-of-screen confirmation bar. */}
      {!aiMode && selectedInfo && (
        <div
          className="perk-explain"
          style={{ borderColor: CATEGORY_COLOR[selectedInfo.category] }}
        >
          <Icon
            name={perkIcon(selectedInfo.id)}
            size={22}
            color={CATEGORY_COLOR[selectedInfo.category]}
          />
          <div className="info">
            <span className="row">
              <span className="name">{perkName(selectedInfo, lang)}</span>
              {/* Where the perk lands, matching the lane highlight color */}
              <span
                className="side-chip"
                style={{ background: SIDE_CHIP_COLOR[selectedInfo.targetSide] }}
              >
                <Icon name={perkIcon(selectedInfo.id)} size={10} color="#fff" />
                {t(SIDE_LABEL_KEY[selectedInfo.targetSide])}
              </span>
            </span>
            <PerkPicto perkId={selectedInfo.id} size={13} />
            <span className="desc">
              {selectedInfo.requiresTarget
                ? t('combat.descNext', { desc: perkDescription(selectedInfo, lang) })
                : perkDescription(selectedInfo, lang)}
            </span>
          </div>
          <button
            className={`bar-btn${highlightConfirm ? ' tut-target' : ''}`}
            style={{ background: CATEGORY_COLOR[selectedInfo.category] }}
            onClick={onConfirm}
          >
            <Icon name="check" size={14} color="#fff" />
            {t('combat.use')}
          </button>
          <button className="bar-btn cancel" onClick={onCancel}>
            <Icon name="close" size={14} color="#fff" />
          </button>
        </div>
      )}
      <div className="perk-chip-row">
        {aiMode && (
          <span className="ai-chip">
            <Icon name="robot" size={12} color="#fff" />
            {t('combat.ai')}
          </span>
        )}
        {slots
          .filter((slot) => slot.perkId > 0)
          .map((slot) => {
            const info = getPerk(slot.perkId);
            const category = info?.category ?? 'utility';
            const isAiChoice = aiHighlight === slot.perkId;
            const isSel = selectedPerkId === slot.perkId;
            const recharging = slot.disabled === true;
            const locked = !aiMode && gated(slot.perkId);
            const isTutTarget = !aiMode && highlightPerkId === slot.perkId;
            const owner = slot.slotIndex >= 2 ? ownerOf(slot.perkId) : undefined;
            const color =
              (disabled && !aiMode) || recharging || locked ? '#757575' : CATEGORY_COLOR[category];
            return (
              <button
                key={slot.slotIndex}
                className={`perk-chip${isSel ? ' selected' : ''}${aiMode ? (isAiChoice ? ' ai-choice' : ' dimmed') : ''}${recharging ? ' dimmed' : ''}${locked ? ' dimmed' : ''}${isTutTarget ? ' tut-target' : ''}`}
                style={
                  isSel
                    ? {
                        borderColor: CATEGORY_COLOR[category],
                        background: `${CATEGORY_COLOR[category]}33`,
                      }
                    : undefined
                }
                disabled={disabled || recharging || locked}
                onClick={() => onPerk(slot.perkId)}
              >
                {/* The glyph leads so pre-readers can pick powers by picture. */}
                <span className="perk-chip-glyph" style={{ color }}>
                  <Icon name={perkIcon(slot.perkId)} size={24} color={color} />
                </span>
                <span className="perk-chip-name">
                  {recharging
                    ? t('combat.recharging')
                    : info
                      ? perkName(info, lang)
                      : slot.perkName}
                </span>
                {!recharging && owner && (
                  <CharacterPortrait
                    character={owner}
                    className="perk-chip-owner"
                    style={{ borderColor: owner.accent }}
                  />
                )}
              </button>
            );
          })}
        {!aiMode && (
          <button
            className={`pass-chip${!allowPass ? ' dimmed' : ''}`}
            disabled={disabled || !allowPass}
            onClick={onPass}
          >
            <span className="perk-chip-glyph" style={{ color: '#8899bb' }}>
              <Icon name="skip" size={24} color={disabled || !allowPass ? '#757575' : '#8899bb'} />
            </span>
            <span className="perk-chip-name">{t('combat.pass')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
