// First-battle tutorial progress. One localStorage flag: once the player has
// been walked through (or skipped) the coach marks, they never reappear.

const TUTORIAL_KEY = 'neon_tutorial_v1';
const TUTORIAL_LEVEL_KEY = 'neon_tutorial_level_v1';

export function isTutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === 'done';
  } catch {
    return true; // no storage (private mode): don't nag every battle
  }
}

export function markTutorialDone(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, 'done');
  } catch {
    // best-effort
  }
}

/** The coach-mark sequence, in battle order. */
export type TutorialStep = 'sides' | 'deploy' | 'power' | 'win';

// --- Training Grid (the guided tutorial level) --------------------------------
// Tracked separately from the coach marks: the home screen badges the level
// until it has been played through once. Finishing it also retires the coach
// marks, since the level teaches strictly more.

export function isTutorialLevelDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_LEVEL_KEY) === 'done';
  } catch {
    return true; // no storage (private mode): don't badge the menu every launch
  }
}

export function markTutorialLevelDone(): void {
  try {
    localStorage.setItem(TUTORIAL_LEVEL_KEY, 'done');
  } catch {
    // best-effort
  }
  markTutorialDone();
}
