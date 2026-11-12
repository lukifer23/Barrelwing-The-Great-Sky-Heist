import Phaser from 'phaser';
import { touchInput } from './TouchControls';

/** Gameplay input with jump buffering. UI input is handled separately by menus. */
export class InputManager {
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private scene: Phaser.Scene;
  jumpBufferMs = 0;
  dashBufferMs = 0;
  attackBufferMs = 0;
  private onJumpDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.jumpBufferMs = 135;
    this.pressedJump = true;
  };
  private onDashDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.dashBufferMs = 140;
  };
  private onAttackDown = (e: KeyboardEvent) => { if (!e.repeat) this.attackBufferMs = 140; };
  private onPauseDown = (e: KeyboardEvent) => { if (!e.repeat) this.pressedPause = true; };
  private onRestartDown = (e: KeyboardEvent) => { if (!e.repeat) this.pressedRestart = true; };
  pressedJump = false;
  pressedPause = false;
  pressedMute = false;
  pressedFullscreen = false;
  pressedRestart = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const kb = scene.input.keyboard;
    if (!kb) return;
    kb.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys.left = kb.addKey(K.LEFT);
    this.keys.right = kb.addKey(K.RIGHT);
    this.keys.up = kb.addKey(K.UP);
    this.keys.down = kb.addKey(K.DOWN);
    this.keys.a = kb.addKey(K.A);
    this.keys.d = kb.addKey(K.D);
    this.keys.w = kb.addKey(K.W);
    this.keys.s = kb.addKey(K.S);
    this.keys.space = kb.addKey(K.SPACE);
    this.keys.j = kb.addKey(K.J);
    this.keys.k = kb.addKey(K.K);
    this.keys.esc = kb.addKey(K.ESC);
    this.keys.p = kb.addKey(K.P);
    this.keys.m = kb.addKey(K.M);
    this.keys.f = kb.addKey(K.F);
    this.keys.r = kb.addKey(K.R);

    kb.on('keydown-SPACE', this.onJumpDown);
    kb.on('keydown-J', this.onDashDown);
    kb.on('keydown-K', this.onAttackDown);
    kb.on('keydown-ESC', this.onPauseDown);
    kb.on('keydown-P', this.onPauseDown);
    kb.on('keydown-R', this.onRestartDown);
  }

  update(dtMs: number): void {
    this.jumpBufferMs = Math.max(0, this.jumpBufferMs - dtMs);
    this.attackBufferMs = Math.max(0, this.attackBufferMs - dtMs);
    this.dashBufferMs = Math.max(0, this.dashBufferMs - dtMs);
    if (touchInput.pressed.delete('jump')) { this.jumpBufferMs = 135; this.pressedJump = true; }
    if (touchInput.pressed.delete('attack')) this.attackBufferMs = 140;
    if (touchInput.pressed.delete('dash')) this.dashBufferMs = 140;
    if (touchInput.pressed.delete('pause')) this.pressedPause = true;
    if (!this.scene.input.keyboard) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc!) || Phaser.Input.Keyboard.JustDown(this.keys.p!)) this.pressedPause = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.m!)) this.pressedMute = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.f!)) this.pressedFullscreen = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.r!)) this.pressedRestart = true;
  }

  consumeJump(): boolean {
    if (this.jumpBufferMs > 0) {
      this.jumpBufferMs = 0;
      return true;
    }
    return false;
  }

  consumeAttack(): boolean {
    if (this.attackBufferMs <= 0) return false;
    this.attackBufferMs = 0; return true;
  }

  consumeDash(): boolean {
    if (this.dashBufferMs > 0) {
      this.dashBufferMs = 0;
      return true;
    }
    return false;
  }

  clearFrameFlags(): void {
    this.pressedPause = false;
    this.pressedMute = false;
    this.pressedFullscreen = false;
    this.pressedRestart = false;
    this.pressedJump = false;
  }

  get horizontal(): number {
    const keyboard = (this.keys.right?.isDown || this.keys.d?.isDown ? 1 : 0) - (this.keys.left?.isDown || this.keys.a?.isDown ? 1 : 0);
    return keyboard || touchInput.axisX;
  }

  get left(): boolean { return touchInput.axisX < -0.1 || !!(this.keys.left?.isDown || this.keys.a?.isDown); }
  get right(): boolean { return touchInput.axisX > 0.1 || !!(this.keys.right?.isDown || this.keys.d?.isDown); }
  get up(): boolean { return touchInput.axisY < -0.4 || !!(this.keys.up?.isDown || this.keys.w?.isDown); }
  get down(): boolean { return touchInput.axisY > 0.55 || !!(this.keys.down?.isDown || this.keys.s?.isDown); }
  get jumpHeld(): boolean { return touchInput.held.has('jump') || !!this.keys.space?.isDown; }

  reset(): void {
    this.jumpBufferMs = 0; this.dashBufferMs = 0; this.attackBufferMs = 0;
    this.clearFrameFlags(); touchInput.reset();
    this.scene.input.keyboard?.resetKeys();
  }

  destroy(): void {
    this.reset();
    const kb = this.scene.input.keyboard;
    if (kb) {
      kb.off('keydown-SPACE', this.onJumpDown);
      kb.off('keydown-J', this.onDashDown);
      kb.off('keydown-K', this.onAttackDown);
      kb.off('keydown-ESC', this.onPauseDown);
      kb.off('keydown-P', this.onPauseDown);
      kb.off('keydown-R', this.onRestartDown);
      Object.values(this.keys).forEach(k => kb.removeKey(k));
    }
    this.keys = {};
  }
}
