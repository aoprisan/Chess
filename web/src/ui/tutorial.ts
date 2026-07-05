// First-battle tutorial progress. One localStorage flag: once the player has
// been walked through (or skipped) the coach marks, they never reappear.

const TUTORIAL_KEY = 'neon_tutorial_v1';

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
