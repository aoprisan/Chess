import { ReactNode, useEffect, useState } from 'react';
import { AssetGroup, groupsReady, preloadGroups } from './preload';

/** Cream loading screen with a progress bar (boot and asset gates). */
export function BootScreen({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="app screen menu-home boot-screen">
      <h1 className="boot-title">Kiddie Chess</h1>
      <div className="boot-bar">
        <div className="boot-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="boot-label">Loading… {percent}%</p>
    </div>
  );
}

/**
 * Renders children only once the given asset groups are fully loaded,
 * showing the loading bar meanwhile. Groups normally finish in the
 * background before the player gets here, so this is usually instant;
 * it only ever waits when the player outruns the background loader.
 *
 * Keyed by the group set: adjacent screens often render a gate at the
 * same tree position (e.g. hero select -> adventure map, both directly
 * under <div className="app">), and without the key React would reuse
 * the previous gate instance — carrying over ready=true from a group
 * that has loaded to one that hasn't.
 */
export function AssetGate({ groups, children }: { groups: AssetGroup[]; children: ReactNode }) {
  return (
    <Gate key={groups.join('+')} groups={groups}>
      {children}
    </Gate>
  );
}

function Gate({ groups, children }: { groups: AssetGroup[]; children: ReactNode }) {
  const [ready, setReady] = useState(() => groupsReady(groups));
  const [progress, setProgress] = useState(ready ? 1 : 0);

  useEffect(() => {
    if (ready) return;
    let stale = false;
    void preloadGroups(groups, (fraction) => {
      if (!stale) setProgress(fraction);
    }).then(() => {
      if (!stale) setReady(true);
    });
    return () => {
      stale = true;
    };
    // The key on <Gate> remounts it whenever the group set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return <BootScreen progress={progress} />;
  return <>{children}</>;
}
