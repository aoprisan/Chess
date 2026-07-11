import { useEffect, useRef } from 'react';
import { MoveLogEntry } from '../../game/engine';
import { Character } from '../../game/characters';
import { Icon } from '../Icons';
import { useLang, useT, formatMoveLog } from '../../i18n';

// --- Move log -----------------------------------------------------------------------

export function MoveLogOverlay({
  entries,
  player1Hero,
  player2Hero,
  onClose,
}: {
  entries: MoveLogEntry[];
  player1Hero: Character;
  player2Hero: Character;
  onClose: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, []);
  return (
    <div className="modal-scrim" style={{ zIndex: 25 }} onClick={onClose}>
      <div className="move-log" onClick={(e) => e.stopPropagation()}>
        <div className="move-log-title">
          <Icon name="list" size={18} color="#FFCA28" />
          {t('combat.battleLog')}
          <button className="bar-btn cancel" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="close" size={14} color="#fff" />
            {t('common.close')}
          </button>
        </div>
        <div className="move-log-list" ref={listRef}>
          {entries.length === 0 && <span className="move-log-empty">{t('combat.nothingYet')}</span>}
          {entries.map((e, i) => {
            const hero = e.side === 'player1' ? player1Hero : player2Hero;
            const color = e.side === 'player1' ? '#00e5ff' : '#ff2fd6';
            return (
              <div key={i} className="move-log-row">
                <span className="ply">{e.ply + 1}</span>
                <span>
                  <b style={{ color }}>{hero.name}</b> {formatMoveLog(e.msg, lang)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
