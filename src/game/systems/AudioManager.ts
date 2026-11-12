import Phaser from 'phaser';
import { SaveManager } from './SaveManager';
import { MUSIC, SFX } from '../data/assets';

export class AudioManager {
  private static game: Phaser.Game | null = null;
  private static current: Phaser.Sound.BaseSound | null = null;
  private static currentKey = '';
  private static unlocked = false;
  private static fades = new Map<Phaser.Sound.BaseSound, number>();

  static bind(game: Phaser.Game): void {
    this.game = game;
  }

  static unlock(): void {
    if (this.unlocked || !this.game) return;
    this.unlocked = true;
    const sm = this.game.sound;
    if (sm instanceof Phaser.Sound.WebAudioSoundManager) sm.context.resume().catch(() => undefined);
  }

  private static get musicVolume(): number {
    const s = SaveManager.get().settings;
    return s.muted ? 0 : s.music;
  }

  private static get sfxVolume(): number {
    const s = SaveManager.get().settings;
    return s.muted ? 0 : s.sfx;
  }

  static playMusic(key: keyof typeof MUSIC, opts: { fade?: number; force?: boolean } = {}): void {
    if (!this.game) return;
    if (!opts.force && this.currentKey === key && this.current?.isPlaying) return;
    const fade = opts.fade ?? 420;
    const cacheKey = 'music_' + key;
    if (!this.game.cache.audio.exists(cacheKey)) return;
    let next: Phaser.Sound.BaseSound;
    try {
      next = this.game.sound.add(cacheKey, { loop: true, volume: 0 });
    } catch { return; }
    next.play();
    if (this.current) this.fade(this.current, (this.current as Phaser.Sound.WebAudioSound).volume ?? 0, 0, fade, true);
    this.current = next;
    this.currentKey = key;
    this.fade(next, 0, this.musicVolume, fade, false);
  }

  static stopMusic(fade = 300): void {
    if (!this.game || !this.current) return;
    const prev = this.current;
    this.current = null;
    this.currentKey = '';
    this.fade(prev, (prev as Phaser.Sound.WebAudioSound).volume ?? 0, 0, fade, true);
  }

  static sfx(key: keyof typeof SFX, opts: { volume?: number; rate?: number; detune?: number } = {}): void {
    if (!this.game) return;
    const vol = this.sfxVolume * (opts.volume ?? 1);
    if (vol <= 0.001) return;
    try {
      const cacheKey = 'sfx_' + key;
      if (!this.game.cache.audio.exists(cacheKey)) return;
      const s = this.game.sound.add(cacheKey, {
        volume: vol,
        rate: Phaser.Math.Clamp(opts.rate ?? 1, 0.5, 2.5),
        detune: opts.detune ?? 0,
      });
      s.once('complete', () => s.destroy());
      if (!s.play()) s.destroy();
    } catch {
      /* ignore audio failures */
    }
  }

  private static fade(sound: Phaser.Sound.BaseSound, from: number, to: number, ms: number, destroy: boolean): void {
    const previous = this.fades.get(sound);
    if (previous !== undefined) window.clearInterval(previous);
    if (ms <= 0) {
      if (destroy) sound.destroy();
      else (sound as Phaser.Sound.WebAudioSound).volume = to;
      return;
    }
    const steps = 12;
    const stepMs = Math.max(16, Math.floor(ms / steps));
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      const target = destroy ? 0 : this.musicVolume;
      const v = from + (target - from) * (i / steps);
      try { (sound as Phaser.Sound.WebAudioSound).volume = v; } catch { /* ignore */ }
      if (i >= steps) {
        window.clearInterval(id);
        this.fades.delete(sound);
        if (destroy) { try { sound.destroy(); } catch { /* ignore */ } }
      }
    }, stepMs);
    this.fades.set(sound, id);
  }

  static setMusicVolumeLive(): void {
    if (!this.current || !this.game) return;
    const fade = this.fades.get(this.current);
    if (fade !== undefined) { window.clearInterval(fade); this.fades.delete(this.current); }
    const t = this.current as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
    if (t && typeof t.volume === 'number') t.volume = this.musicVolume;
  }

  static refreshVolumes(): void {
    this.setMusicVolumeLive();
    if (this.game) this.game.sound.mute = SaveManager.get().settings.muted;
  }

  static get isMuted(): boolean {
    return SaveManager.get().settings.muted;
  }
}
