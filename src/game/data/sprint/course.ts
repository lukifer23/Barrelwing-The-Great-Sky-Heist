import { SPRINT_CLASSES, type SprintClass } from '../sprint';
import { GAME_HEIGHT } from '../../config';

export const SPRINT_COURSE_VERSION = 1;
export const SPRINT_CANONICAL = { width: 480, height: GAME_HEIGHT, minGapY: 50, bottomMargin: 34, gateWidth: 34 } as const;

export interface CourseGate {
  index: number;
  x: number;
  gapY: number;
  gapH: number;
  acorns: { x: number; y: number }[];
}

/** xorshift32. Kept in one place so TypeScript and the GBA runtime share vectors. */
export function nextU32(state: number): number {
  let x = state >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x >>> 0;
}

function range(state: number, min: number, max: number): { state: number; value: number } {
  const next = nextU32(state);
  return { state: next, value: min + (next % (max - min + 1)) };
}

/**
 * Seeded Sky Sprint course. Display size never enters this class; the web and
 * GBA renderers project the same canonical 480x270 course.
 */
export class SprintCourse {
  readonly version = SPRINT_COURSE_VERSION;
  private rng: number;
  private nextX = 510;
  private lastGapY = 132;
  private index = 0;

  constructor(readonly seed: number, readonly sprintClass: SprintClass) {
    this.rng = (seed >>> 0) || 1;
  }

  next(speed: number, elapsedMs: number): CourseGate {
    const rules = SPRINT_CLASSES[this.sprintClass];
    let step = range(this.rng, rules.gap[0], rules.gap[1]);
    const gapH = step.value; this.rng = step.state;
    const minY = SPRINT_CANONICAL.minGapY + Math.floor(gapH / 2);
    const maxY = SPRINT_CANONICAL.height - SPRINT_CANONICAL.bottomMargin - Math.floor(gapH / 2);
    step = range(this.rng, -36, 36);
    const gapY = Math.max(minY, Math.min(maxY, this.lastGapY + step.value));
    this.rng = step.state;
    this.lastGapY = gapY;

    step = range(this.rng, 0, 99);
    const acorns: { x: number; y: number }[] = [];
    if (step.value < 70) {
      for (let i = 0; i < 3; i++) acorns.push({ x: this.nextX - 30 - i * 22, y: gapY + [0, 6, -6][i] });
    }
    this.rng = step.state;

    const gate: CourseGate = { index: this.index++, x: this.nextX, gapY, gapH, acorns };
    const spacingPercent = 150 - Math.min(45, Math.floor(elapsedMs / 2000));
    this.nextX += Math.floor(speed * spacingPercent / 100);
    return gate;
  }
}

export function goldenCourse(seed: number, sprintClass: SprintClass, count = 8): CourseGate[] {
  const course = new SprintCourse(seed, sprintClass);
  const gates: CourseGate[] = [];
  for (let i = 0; i < count; i++) {
    const elapsed = i * 1000;
    const speed = Math.min(SPRINT_CLASSES[sprintClass].topSpeed, SPRINT_CLASSES[sprintClass].speed + Math.floor(elapsed / 900));
    gates.push(course.next(speed, elapsed));
  }
  return gates;
}
