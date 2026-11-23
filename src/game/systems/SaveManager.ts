import { SPRINT_CLASSES, type SprintClass } from '../data/sprint';
import { TOTAL_LEVELS, TRIAL_IDS } from '../data/progression';
import { emptyMastery, STAMPS, type Mastery } from '../data/mastery';
import { emptyBrawlRecord, MATCH_LENGTH, type BrawlRecord, type BrawlRun, type BrawlOptions, type BrawlPreset } from '../data/brawl';
import legacyObjectIds from '../data/legacyObjectIds.json';
import { characterId, type CharacterId } from '../data/characters';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { emptyUpgrades, UPGRADES, UPGRADE_COSTS, upgradeStats, type UpgradeKind, type Upgrades } from '../data/upgrades';

export interface LevelRecord {
  completed: boolean;
  bestScore: number;
  bestTimeMs: number;
  gems: [boolean, boolean, boolean];
  rating: 0 | 1 | 2 | 3; // 0 none, 1 bronze, 2 silver, 3 gold
  mastery: Mastery;
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
  oneHanded: boolean;
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
  character: CharacterId;
  objectVersion: 2;
  deaths: number;
  damageTaken: number;
}

export const PROFILE_SLOTS = [1, 2, 3] as const;
export type ProfileSlot = typeof PROFILE_SLOTS[number];

export interface ProfileData {
  version: number;
  revision: number;
  levels: Record<number, LevelRecord>;
  unlocked: number;
  bonusUnlocked: boolean;
  bonusBest: number;
  galeBest: number;
  completedGame: boolean;
  totalScore: number;
  settings: Settings;
  upgrades: Upgrades;
  run: RunSnapshot | null;
  cloverUnlocked: boolean;
  selectedCharacter: CharacterId;
  brawl: BrawlRecord;
  brawlRun: BrawlRun | null;
  brawlPreset: BrawlPreset | null;
}

export interface SaveData extends ProfileData {
  slot: ProfileSlot;
  otherProfiles: Partial<Record<ProfileSlot, ProfileData>>;
}

function earnedShards(levels: Record<number, LevelRecord>): number {
  return Object.values(levels).reduce((n, r) => n + r.gems.filter(Boolean).length + r.rating + STAMPS.filter(key => r.mastery[key]).length, 0);
}

export function courierLevel(profile: ProfileData) {
  const marks = earnedShards(profile.levels);
  return { level: 1 + Math.floor(marks / 9), toNext: marks >= TOTAL_LEVELS * 9 ? 0 : 9 - marks % 9 };
}

const KEY = 'barrelwing.save.v1';
const VERSION = 1;
const BACKUP_KEY = KEY + '.backup';
const androidJournal = registerPlugin<{ write(options: { snapshot: string }): Promise<void> }>('SaveJournal');
const finite = (v: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback;
const ids = (v: unknown): number[] => Array.isArray(v) ? [...new Set(v.filter(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff))] : [];

function settingsFrom(raw: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  return { music: finite(raw?.music, d.music, 1), sfx: finite(raw?.sfx, d.sfx, 1),
    shake: finite(raw?.shake, d.shake, 1), muted: raw?.muted === true, reducedMotion: raw?.reducedMotion === true,
    touchScale: Math.max(0.75, finite(raw?.touchScale, 1, 1.5)), touchOpacity: Math.max(0.25, finite(raw?.touchOpacity, 0.75, 1)),
    oneHanded: raw?.oneHanded === true, leftHanded: raw?.leftHanded === true, haptics: raw?.haptics !== false, showFps: raw?.showFps === true };
}


const emptyLevel = (): LevelRecord => ({
  completed: false,
  bestScore: 0,
  bestTimeMs: 0,
  gems: [false, false, false],
  rating: 0,
  mastery: emptyMastery(),
});

export const defaultSettings = (): Settings => ({
  music: 0.45,
  sfx: 0.8,
  muted: false,
  shake: 1,
  reducedMotion: false,
  touchScale: 1, touchOpacity: 0.75, leftHanded: false, oneHanded: false, haptics: true, showFps: false,
});

function emptyProfile(): ProfileData {
  const levels: Record<number, LevelRecord> = {};
  for (let i = 1; i <= TOTAL_LEVELS; i++) levels[i] = emptyLevel();
  return {
    version: VERSION,
    revision: 0,
    levels,
    unlocked: 1,
    bonusUnlocked: false,
    bonusBest: 0, galeBest: 0,
    completedGame: false,
    totalScore: 0,
    settings: defaultSettings(),
    upgrades: emptyUpgrades(),
    run: null,
    cloverUnlocked: false, selectedCharacter: 'pip', brawl: emptyBrawlRecord(), brawlRun: null, brawlPreset: null,
  };
}

export function emptySave(): SaveData {
  return { ...emptyProfile(), slot: 1, otherProfiles: {} };
}

export class SaveManager {
  private static data: SaveData | null = null;
  private static nativeWrite: Promise<void> = Promise.resolve();

  static async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) { this.get(); return; }
    let newest = this.load();
    for (const key of [KEY, BACKUP_KEY]) {
      try {
        const stored = await Preferences.get({ key });
        if (!stored.value) continue;
        const parsed = JSON.parse(stored.value);
        if (parsed?.version !== VERSION) continue;
        const candidate = this.migrate(parsed);
        if (!newest || candidate.revision > newest.revision || key === KEY && candidate.revision === newest.revision) newest = candidate;
      } catch { /* Try the remaining native and synchronous recovery copies. */ }
    }
    this.data = newest ?? emptySave();
  }

  static get(): SaveData {
    if (!this.data) this.data = this.load() ?? emptySave();
    return this.data;
  }

  private static load(): SaveData | null {
    let newest: SaveData | null = null;
    for (const key of [KEY, BACKUP_KEY]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== VERSION) continue;
        const candidate = this.migrate(parsed);
        if (!newest || candidate.revision > newest.revision) newest = candidate;
      } catch { /* Try the last durable copy before starting fresh. */ }
    }
    return newest;
  }

  private static migrate(raw: Partial<SaveData>): SaveData {
    const slot = PROFILE_SLOTS.find(id => id === raw.slot) ?? 1;
    const otherProfiles: SaveData['otherProfiles'] = {};
    for (const id of PROFILE_SLOTS) {
      const other = raw.otherProfiles?.[id];
      if (id !== slot && other?.version === VERSION) otherProfiles[id] = this.migrateProfile(other);
    }
    return { ...this.migrateProfile(raw), slot, otherProfiles };
  }

  static switchProfile(slot: ProfileSlot): void {
    const { slot: previous, otherProfiles, ...current } = this.get();
    if (slot === previous || !PROFILE_SLOTS.includes(slot)) return;
    const next = otherProfiles[slot] ?? emptyProfile();
    const others = { ...otherProfiles, [previous]: current };
    delete others[slot];
    this.data = { ...next, revision: current.revision, settings: current.settings, slot, otherProfiles: others };
    this.save();
  }

  private static migrateProfile(raw: Partial<ProfileData>): ProfileData {
    const base = emptyProfile();
    const levels = { ...base.levels };
    for (let i = 1; i <= TOTAL_LEVELS; i++) {
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
          mastery: Object.fromEntries(STAMPS.map(key => [key, rec.completed === true && rec.mastery?.[key] === true])) as Mastery,
        };
      }
    }
    const cloverUnlocked = raw.cloverUnlocked === true || earnedShards(levels) >= 9;
    return {
      version: VERSION,
      revision: Math.floor(finite(raw.revision)),
      levels,
      unlocked: Math.max(Math.floor(finite(raw.unlocked, 1, 9)), 1, ...Object.entries(levels).filter(([id, l]) => +id <= 9 && l.completed).map(([id]) => Math.min(9, +id + 1))),
      bonusUnlocked: raw.bonusUnlocked === true || levels[3].completed,
      bonusBest: Number.isFinite(raw.bonusBest) ? Math.max(0, raw.bonusBest!) : 0,
      galeBest: finite(raw.galeBest),
      completedGame: raw.completedGame === true || levels[9].completed,
      totalScore: Number.isFinite(raw.totalScore) ? Math.max(0, raw.totalScore!) : 0,
      settings: settingsFrom(raw.settings),
      upgrades: this.cleanUpgrades(raw.upgrades, levels),
      run: this.cleanRun(raw.run),
      cloverUnlocked,
      selectedCharacter: raw.selectedCharacter === 'clover' && !cloverUnlocked ? 'pip' : characterId(raw.selectedCharacter),
      brawl: { wins: Math.floor(finite(raw.brawl?.wins)), losses: Math.floor(finite(raw.brawl?.losses)), streak: Math.floor(finite(raw.brawl?.streak)), bestStreak: Math.floor(finite(raw.brawl?.bestStreak)), knockouts: Math.floor(finite(raw.brawl?.knockouts)) },
      brawlRun: this.cleanBrawlRun(raw.brawlRun),
      brawlPreset: this.cleanBrawlPreset(raw.brawlPreset ?? raw.brawlRun),
    };
  }

  private static cleanUpgrades(raw: Partial<Upgrades> | undefined, levels: Record<number, LevelRecord>): Upgrades {
    const out = emptyUpgrades();
    let budget = earnedShards(levels);
    for (const key of Object.keys(UPGRADES) as UpgradeKind[]) {
      const tier = Math.floor(finite(raw?.[key], 0, UPGRADE_COSTS.length));
      for (let i = 0; i < tier && budget >= UPGRADE_COSTS[i]; i++) {
        out[key]++; budget -= UPGRADE_COSTS[i];
      }
    }
    return out;
  }

  private static cleanRun(raw: RunSnapshot | null | undefined): RunSnapshot | null {
    if (!raw || !Number.isInteger(raw.levelId) || raw.levelId < 1 || raw.levelId > TOTAL_LEVELS || finite(raw.lives) < 1) return null;
    if (!Number.isFinite(raw.checkpoint?.x) || !Number.isFinite(raw.checkpoint?.y)) return null;
    return {
      levelId: raw.levelId, checkpoint: { x: finite(raw.checkpoint.x, 0, 10000), y: finite(raw.checkpoint.y, 0, 10000) },
      lives: Math.floor(finite(raw.lives, 3, 99)), hearts: Math.floor(finite(raw.hearts, 3, 6)),
      score: finite(raw.score), coins: Math.floor(finite(raw.coins)), elapsedMs: finite(raw.elapsedMs),
      gems: [raw.gems?.[0] === true, raw.gems?.[1] === true, raw.gems?.[2] === true],
      collected: raw.objectVersion === 2 ? ids(raw.collected) : this.migrateObjectIds(raw.levelId, raw.collected),
      defeated: raw.objectVersion === 2 ? ids(raw.defeated) : this.migrateObjectIds(raw.levelId, raw.defeated), objectVersion: 2,
      switches: Array.isArray(raw.switches) ? raw.switches.filter(s => typeof s === 'string').slice(0, 100) : [],
      bossDefeated: raw.bossDefeated === true, bossHp: Math.floor(finite(raw.bossHp, 6, 6)), bossPhase: Math.max(1, Math.floor(finite(raw.bossPhase, 1, 3))), character: characterId(raw.character),
      // Older runs have no hit history and cannot establish a clean delivery.
      deaths: Math.floor(finite(raw.deaths, 1)), damageTaken: Math.floor(finite(raw.damageTaken, 1)),
    };
  }

  private static migrateObjectIds(levelId: number, values: unknown): number[] {
    const legacy = (legacyObjectIds as Record<string, number[]>)[levelId] ?? [];
    return ids(values).map(index => legacy[index]).filter(id => id !== undefined);
  }

  static storageAvailable = true;

  static save(): void {
    this.get().revision++;
    const serialized = JSON.stringify(this.get());
    if (Capacitor.isNativePlatform()) {
      this.nativeWrite = this.nativeWrite.catch(() => undefined).then(async () => {
        if (Capacitor.getPlatform() === 'android') {
          await androidJournal.write({ snapshot: serialized });
          return;
        }
        await Preferences.set({ key: KEY, value: serialized });
        await Preferences.set({ key: BACKUP_KEY, value: serialized });
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

  /** Await queued native persistence before verifying it or leaving a session. */
  static async flush(): Promise<void> {
    await this.nativeWrite;
  }

  static get shards(): number {
    const d = this.get();
    const earned = earnedShards(d.levels);
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

  private static cleanBrawlPreset(raw: BrawlOptions | null | undefined): BrawlPreset | null {
    if (!raw || !['forest', 'factory', 'storm'].includes(raw.arena) || !['easy', 'normal', 'hard'].includes(raw.difficulty)) return null;
    return { arena: raw.arena, difficulty: raw.difficulty, player: characterId(raw.player), cpu: characterId(raw.cpu),
      rules: raw.rules === 'timed' ? 'timed' : 'stock' };
  }

  static setBrawlPreset(preset: BrawlPreset): void { this.get().brawlPreset = preset; this.save(); }

  private static cleanBrawlRun(raw: BrawlRun | null | undefined): BrawlRun | null {
    const preset = this.cleanBrawlPreset(raw);
    if (!raw || !preset || raw.playerStocks < 1 || raw.cpuStocks < 1) return null;
    const playerStocks = Math.max(1, Math.floor(finite(raw.playerStocks, 3, 3)));
    const cpuStocks = Math.max(1, Math.floor(finite(raw.cpuStocks, 3, 3)));
    // Released stock snapshots in overtime stored elapsed time but no explicit flag.
    const suddenDeath = raw.suddenDeath === true || (raw.suddenDeath === undefined && raw.elapsedMs > MATCH_LENGTH.stock);
    return { ...preset, suddenDeath,
      playerStocks, cpuStocks, playerKOs: Math.floor(finite(raw.playerKOs, 3 - cpuStocks)), cpuKOs: Math.floor(finite(raw.cpuKOs, 3 - playerStocks)),
      playerDamage: finite(raw.playerDamage, 0, 999), cpuDamage: finite(raw.cpuDamage, 0, 999), elapsedMs: finite(raw.elapsedMs) };
  }

  static saveBrawlRun(run: BrawlRun | null): void { this.get().brawlRun = run; this.save(); }
  static recordBrawl(won: boolean, knockouts: number): void {
    const r = this.get().brawl;
    if (won) { r.wins++; r.streak++; r.bestStreak = Math.max(r.bestStreak, r.streak); }
    else { r.losses++; r.streak = 0; }
    r.knockouts += Math.max(0, Math.floor(knockouts));
    this.get().brawlRun = null;
    this.save();
  }

  static selectCharacter(id: CharacterId): void {
    if (id === 'clover' && !this.get().cloverUnlocked) return;
    this.get().selectedCharacter = characterId(id); this.save();
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
    const revision = this.get().revision;
    const settings = { ...this.get().settings };
    const selectedCharacter = this.get().selectedCharacter;
    const { brawl, brawlRun, brawlPreset, bonusBest, galeBest, cloverUnlocked, slot, otherProfiles } = this.get();
    this.data = { ...emptyProfile(), slot, otherProfiles };
    // Reset is a newer save too; retain ordering against older recovery copies.
    this.data.revision = revision;
    this.data.settings = settings;
    this.data.selectedCharacter = selectedCharacter; this.data.cloverUnlocked = cloverUnlocked;
    this.data.brawlPreset = brawlPreset; this.data.brawl = brawl; this.data.brawlRun = brawlRun; this.data.bonusBest = bonusBest; this.data.galeBest = galeBest;
    this.save();
  }

  static recordLevel(
    id: number,
    result: { score: number; timeMs: number; gems: [boolean, boolean, boolean]; completed: boolean; mastery?: Mastery; rating?: 1 | 2 | 3 },
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
      rating: Math.max(prev.rating, result.completed ? result.rating ?? 0 : 0) as LevelRecord['rating'],
      mastery: Object.fromEntries(STAMPS.map(key => [key, prev.mastery[key] || result.completed && result.mastery?.[key] === true])) as Mastery,
    };
    d.levels[id] = merged;
    if (!d.cloverUnlocked && earnedShards(d.levels) >= 9) d.cloverUnlocked = true;
    if (result.completed) {
      if (d.run?.levelId === id) d.run = null;
      d.totalScore += Math.max(0, result.score);
      if (id <= 9) d.unlocked = Math.max(d.unlocked, Math.min(9, id + 1));
      if (id === 3) d.bonusUnlocked = true;
      if (id === 9) d.completedGame = true;
    }
    this.save();
    return merged;
  }

  static setBonusBest(score: number, sprintClass: SprintClass = 'classic'): void {
    const key = SPRINT_CLASSES[sprintClass].best;
    const d = this.get();
    if (score > d[key]) {
      d[key] = score;
      this.save();
    }
  }

  static isUnlocked(id: number): boolean {
    const d = this.get();
    return Number.isInteger(id) && id >= 1 && id <= 9 && (id <= d.unlocked || !!d.levels[id]?.completed);
  }

  /** Main levels use progression; trials require a finished campaign. */
  static isLevelAvailable(id: number): boolean {
    if (Number.isInteger(id) && id >= 10 && id <= TOTAL_LEVELS) return this.get().completedGame;
    return this.isUnlocked(id);
  }

  static get trialGems(): number {
    return TRIAL_IDS.reduce((n, id) => n + (this.get().levels[id]?.gems.filter(Boolean).length ?? 0), 0);
  }

}
