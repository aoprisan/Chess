import { useState } from 'react';
import { CharacterId, characterById, buildPerkPools } from '../game/characters';
import { CampaignController } from '../campaign/controller';
import { CampaignNode } from '../campaign/model';
import { getPerk } from '../game/perks';
import { CharacterPortrait } from './CharacterPortrait';
import { CATEGORY_COLOR } from './perkTheme';
import { Icon } from './Icons';
import { MAX_SEATS } from '../campaign/balance';

// Pre-battle seat picker: choose up to `seats` crew members to bring into a
// node battle. Locked seats show how to unlock them; the preview lists the
// perk pool the seated team brings to slots 3/4.
export function TeamPicker({
  controller,
  node,
  onStart,
  onCancel,
}: {
  controller: CampaignController;
  node: CampaignNode;
  onStart: (team: CharacterId[]) => void;
  onCancel: () => void;
}) {
  const seats = controller.seats;
  const crew = controller.crew;
  const [team, setTeam] = useState<CharacterId[]>(() =>
    controller.lastTeam.length > 0 ? controller.lastTeam : crew.slice(0, seats),
  );

  const toggle = (id: CharacterId) => {
    setTeam((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < seats
          ? [...prev, id]
          : prev,
    );
  };

  const defenders = controller.effectiveDefenders(node);
  const pools = buildPerkPools(team);
  const poolPerks = [...pools.slot3, ...pools.slot4]
    .map((id) => getPerk(id))
    .filter((p) => p !== undefined);

  return (
    <div className="modal-scrim" style={{ zIndex: 40 }} onClick={onCancel}>
      <div className="team-picker" onClick={(e) => e.stopPropagation()}>
        <div className="tp-title">
          Assemble your team
          <span className="tp-subtitle">
            vs {defenders.map((id) => characterById(id).name).join(', ')} ·{' '}
            {node.critical ? 'critical system · ' : ''}
            {node.difficulty}
          </span>
        </div>

        {/* Seats */}
        <div className="tp-seats">
          {Array.from({ length: MAX_SEATS }, (_, i) => {
            const locked = i >= seats;
            const id = team[i];
            return (
              <div key={i} className={`tp-seat${locked ? ' locked' : ''}`}>
                {locked ? (
                  <>
                    <Icon name="lock" size={16} color="#8899bb" />
                    <span className="tp-seat-hint">
                      {i === 3 ? 'Restore Street Grid' : 'Restore Metro Net'}
                    </span>
                  </>
                ) : id ? (
                  <button className="tp-seat-char" onClick={() => toggle(id)}>
                    <CharacterPortrait
                      character={characterById(id)}
                      style={{ width: '70%', height: '70%', objectFit: 'contain' }}
                    />
                    <span>{characterById(id).name}</span>
                  </button>
                ) : (
                  <span className="tp-seat-hint">Empty seat</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Crew grid */}
        <div className="tp-crew">
          {crew.map((id) => {
            const c = characterById(id);
            const seated = team.includes(id);
            return (
              <button
                key={id}
                className={`tp-crew-card${seated ? ' seated' : ''}`}
                onClick={() => toggle(id)}
                title={c.perkIds
                  .map((perkId) => getPerk(perkId)?.name)
                  .filter(Boolean)
                  .join(', ')}
              >
                <CharacterPortrait
                  character={c}
                  style={{ width: 40, height: 40, objectFit: 'contain' }}
                />
                <span>{c.name}</span>
              </button>
            );
          })}
        </div>

        {/* Perk pool preview */}
        <div className="tp-pool">
          <span className="tp-pool-label">Team powers:</span>
          {poolPerks.length === 0 ? (
            <span className="tp-pool-empty">none — any power can appear</span>
          ) : (
            poolPerks.map((p) => (
              <span
                key={p.id}
                className="chip"
                style={{ borderColor: CATEGORY_COLOR[p.category], color: CATEGORY_COLOR[p.category] }}
                title={p.description}
              >
                {p.name}
              </span>
            ))
          )}
        </div>

        <div className="tp-actions">
          <button className="img-btn grey" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="img-btn yellow"
            disabled={team.length === 0}
            style={{ opacity: team.length === 0 ? 0.5 : 1 }}
            onClick={() => {
              controller.setLastTeam(team);
              onStart(team);
            }}
          >
            Start battle ({team.length}/{seats})
          </button>
        </div>
      </div>
    </div>
  );
}
