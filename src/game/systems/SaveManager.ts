import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { emptyUpgrades, UPGRADES, UPGRADE_COSTS, upgradeStats, type UpgradeKind, type Upgrades } from '../data/upgrades';

export interface LevelRecord {
  completed: boolean;
  bestScore: number;
  bestTimeMs: number;
  gems: [boolean, boolean, boolean];
  rating: 0 | 1 | 2 | 3; // 0 none, 1 bronze, 2 silver, 3 gold
}

export interface Settings {
  music: number;
  sfx: number;
  muted: boolean;
  shake: number; // 0..1
  reducedMotion: boolean;
  touchScale: number;
  touchOpacity: number;
  leftHanded: boolean;
  haptics: boolean;
  showFps: boolean;
}

export interface RunSnapshot {
  levelId: number;
  checkpoint: { x: number; y: number };
  lives: number;
  hearts: number;
  score: number;
  coins: number;
  elapsedMs: number;
  gems: [boolean, boolean, boolean];
  collected: number[];
  defeated: number[];
  switches: string[];
  bossDefeated: boolean;
  bossHp: number;
  bossPhase: number;
}

export interface SaveData {
  version: number;
  levels: Record<number, LevelRecord>;
  unlocked: number;
  bonusUnlocked: boolean;
  bonusBest: number;
  completedGame: boolean;
  totalScore: number;
  settings: Settings;
  upgrades: Upgrades;
  run: RunSnapshot | null;
}

const KEY = 'barrelwing.save.v1';
const VERSION = 1;
const BACKUP_KEY = KEY + '.backup';
const finite = (v: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback;
const ids = (v: unknown): number[] => Array.isArray(v) ? [...new Set(v.filter(n => Number.isInteger(n) && n >= 0 && n < 10000))] : [];

function settingsFrom(raw: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  return { music: finite(raw?.music, d.music, 1), sfx: finite(raw?.sfx, d.sfx, 1),
    shake: finite(raw?.shake, d.shake, 1), muted: raw?.muted === true, reducedMotion: raw?.reducedMotion === true,
    touchScale: Math.max(0.75, finite(raw?.touchScale, 1, 1.5)), touchOpacity: Math.max(0.25, finite(raw?.touchOpacity, 0.75, 1)),
    leftHanded: raw?.leftHanded === true, haptics: raw?.haptics !== false, showFps: raw?.showFps === true };
}


const emptyLevel = (): LevelRecord => ({
  completed: false,
  bestScore: 0,
  bestTimeMs: 0,
  gems: [false, false, false],
  rating: 0,
});

export const defaultSettings = (): Settings => ({
  music: 0.45,
  sfx: 0.8,
  muted: false,
  shake: 1,
  reducedMotion: false,
  touchScale: 1, touchOpacity: 0.75, leftHanded: false, haptics: true, showFps: false,
});

export function emptySave(): SaveData {
  const levels: Record<number, LevelRecord> = {};
  for (let i = 1; i <= 12; i++) levels[i] = emptyLevel();
  return {
    version: VERSION,
    levels,
    unlocked: 1,
    bonusUnlocked: false,
    bonusBest: 0,
    completedGame: false,
    totalScore: 0,
    settings: defaultSettings(),
    upgrades: emptyUpgrades(),
    run: null,
  };
}

export class SaveManager {
  private static data: SaveData | null = null;
  private static nativeWrite: Promise<void> = Promise.resolve();

  static async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) { this.get(); return; }
    try {
      const stored = await Preferences.get({ key: KEY });
      if (stored.value) {
        const parsed = JSON.parse(stored.value);
        if (parsed?.version === VERSION) this.data = this.migrate(parsed);
      }
    } catch { /* The local journal remains a recovery copy. */ }
    this.get();
  }

  static get(): SaveData {
    if (!this.data) this.data = this.load();
    return this.data;
  }

  private static load(): SaveData {
    for (const key of [KEY, BACKUP_KEY]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== VERSION) continue;
        return this.migrate(parsed);
      } catch { /* Try the last durable copy before starting fresh. */ }
    }
    return emptySave();
  }

  private static migrate(raw: Partial<SaveData>): SaveData {
    if (!raw || typeof raw !== 'object' || raw.version !== VERSION) return emptySave();
    const base = emptySave();
    const levels = { ...base.levels };
    for (let i = 1; i <= 12; i++) {
      const rec = raw.levels?.[i];
      if (rec && typeof rec === 'object') {
        levels[i] = {
          completed: !!rec.completed,
          bestScore: Number.isFinite(rec.bestScore) ? Math.max(0, rec.bestScore) : 0,
          bestTimeMs: Number.isFinite(rec.bestTimeMs) ? Math.max(0, rec.bestTimeMs) : 0,
          gems: [
            !!(rec.gems && rec.gems[0]),
            !!(rec.gems && rec.gems[1]),
            !!(rec.gems && rec.gems[2]),
          ],
          rating: ([0, 1, 2, 3] as const).includes(rec.rating as 0) ? (rec.rating as 0 | 1 | 2 | 3) : 0,
        };
      }
    }
    return {
      version: VERSION,
      levels,
      unlocked: Math.max(Math.floor(finite(raw.unlocked, 1, 9)), 1, ...Object.entries(levels).filter(([id, l]) => +id <= 9 && l.completed).map(([id]) => Math.min(9, +id + 1))),
      bonusUnlocked: raw.bonusUnlocked === true || levels[3].completed,
      bonusBest: Number.isFinite(raw.bonusBest) ? Math.max(0, raw.bonusBest!) : 0,
      completedGame: raw.completedGame === true || levels[9].completed,
      totalScore: Number.isFinite(raw.totalScore) ? Math.max(0, raw.totalScore!) : 0,
      settings: settingsFrom(raw.settings),
      upgrades: this.cleanUpgrades(raw.upgrades, levels),
      run: this.cleanRun(raw.run),
    };
  }

  private static cleanUpgrades(raw: Partial<Upgrades> | undefined, levels: Record<number, LevelRecord>): Upgrades {
    const out = emptyUpgrades();
    let budget = Object.values(levels).reduce((n, r) => n + r.gems.filter(Boolean).length + r.rating, 0);
    for (const key of Object.keys(UPGRADES) as UpgradeKind[]) {
      const tier = Math.floor(finite(raw?.[key], 0, UPGRADE_COSTS.length));
      for (let i = 0; i < tier && budget >= UPGRADE_COSTS[i]; i++) {
        out[key]++; budget -= UPGRADE_COSTS[i];
      }
    }
    return out;
  }

  private static cleanRun(raw: RunSnapshot | null | undefined): RunSnapshot | null {
    if (!raw || !Number.isInteger(raw.levelId) || raw.levelId < 1 || raw.levelId > 12 || finite(raw.lives) < 1) return null;
    if (!Number.isFinite(raw.checkpoint?.x) || !Number.isFinite(raw.checkpoint?.y)) return null;
    return {
      levelId: raw.levelId, checkpoint: { x: finite(raw.checkpoint.x, 0, 10000), y: finite(raw.checkpoint.y, 0, 10000) },
      lives: Math.floor(finite(raw.lives, 3, 99)), hearts: Math.floor(finite(raw.hearts, 3, 5)),
      score: finite(raw.score), coins: Math.floor(finite(raw.coins)), elapsedMs: finite(raw.elapsedMs),
      gems: [raw.gems?.[0] === true, raw.gems?.[1] === true, raw.gems?.[2] === true],
      collected: ids(raw.collected), defeated: ids(raw.defeated),
      switches: Array.isArray(raw.switches) ? raw.switches.filter(s => typeof s === 'string').slice(0, 100) : [],
      bossDefeated: raw.bossDefeated === true, bossHp: Math.floor(finite(raw.bossHp, 6, 6)), bossPhase: Math.max(1, Math.floor(finite(raw.bossPhase, 1, 3))),
    };
  }

  static storageAvailable = true;

  static save(): void {
    const serialized = JSON.stringify(this.get());
    if (Capacitor.isNativePlatform()) {
      this.nativeWrite = this.nativeWrite.catch(() => undefined).then(async () => {
        await Preferences.set({ key: KEY, value: serialized });
      });
      void this.nativeWrite.catch(() => { this.storageAvailable = false; });
    }
    try {
      localStorage.setItem(KEY, serialized);
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
      return;
    }
    try { localStorage.setItem(BACKUP_KEY, serialized); } catch { /* Primary save succeeded. */ }
  }

  static saveRun(run: RunSnapshot | null): void {
    this.get().run = run;
    this.save();
  }

  static get shards(): number {
    const d = this.get();
    const earned = Object.values(d.levels).reduce((n, r) => n + r.gems.filter(Boolean).length + r.rating, 0);
    const spent = Object.values(d.upgrades).reduce((n, tier) => n + UPGRADE_COSTS.slice(0, tier).reduce((sum, cost) => sum + cost, 0), 0);
    return Math.max(0, earned - spent);
  }

  static buyUpgrade(kind: UpgradeKind): boolean {
    const d = this.get();
    const cost = UPGRADE_COSTS[d.upgrades[kind]];
    if (cost === undefined || this.shards < cost) return false;
    d.upgrades[kind]++;
    this.save();
    return true;
  }

  static get stats() { return upgradeStats(this.get().upgrades); }

  static patchSettings(patch: Partial<Settings>): void {
    this.get().settings = settingsFrom({ ...this.get().settings, ...patch });
    this.save();
  }

  static hasProgress(): boolean {
    const d = this.get();
    return !!d.run || d.unlocked > 1 || Object.values(d.levels).some(l => l.completed);
  }

  static resetProgress(): void {
    const settings = { ...this.get().settings };
    this.data = emptySave();
    this.data.settings = settings;
    this.save();
  }

  static recordLevel(
    id: number,
    result: { score: number; timeMs: number; gems: [boolean, boolean, boolean]; completed: boolean },
  ): LevelRecord {
    const d = this.get();
    const prev = d.levels[id] ?? emptyLevel();
    const merged: LevelRecord = {
      completed: prev.completed || result.completed,
      bestScore: Math.max(prev.bestScore, result.score),
      bestTimeMs: result.completed && result.timeMs > 0
        ? (prev.bestTimeMs === 0 ? result.timeMs : Math.min(prev.bestTimeMs, result.timeMs)) : prev.bestTimeMs,
      gems: [
        prev.gems[0] || result.gems[0],
        prev.gems[1] || result.gems[1],
        prev.gems[2] || result.gems[2],
      ],
      rating: prev.rating,
    };
    d.levels[id] = merged;
    if (result.completed) {
      if (id <= 9) d.unlocked = Math.max(d.unlocked, Math.min(9, id + 1));
      if (id === 3) d.bonusUnlocked = true;
      if (id === 9) d.completedGame = true;
    }
    this.save();
    return merged;
  }

  static setRating(id: number, rating: 1 | 2 | 3): void {
    const rec = this.get().levels[id];
    if (rec) rec.rating = Math.max(rec.rating, rating) as 0 | 1 | 2 | 3;
    this.save();
  }

  static setBonusBest(score: number): void {
    const d = this.get();
    if (score > d.bonusBest) {
      d.bonusBest = score;
      this.save();
    }
  }

  static addTotalScore(n: number): void {
    this.get().totalScore += Math.max(0, n);
    this.save();
  }

  static isUnlocked(id: number): boolean {
    const d = this.get();
    return Number.isInteger(id) && id >= 1 && id <= 9 && (id <= d.unlocked || !!d.levels[id]?.completed);
  }

  static isTrial(id: number): boolean {
    return id >= 10;
  }

  /** Main levels use progression; trials require a finished campaign. */
  static isLevelAvailable(id: number): boolean {
    if (Number.isInteger(id) && id >= 10 && id <= 12) return this.get().completedGame;
    return this.isUnlocked(id);
  }

  static get trialGems(): number {
    return [10, 11, 12].reduce((n, id) => n + (this.get().levels[id]?.gems.filter(Boolean).length ?? 0), 0);
  }

}
