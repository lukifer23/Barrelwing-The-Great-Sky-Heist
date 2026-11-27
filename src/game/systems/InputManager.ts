import Phaser from 'phaser';
import { ActionInput, type Action } from './ActionInput';

/** Gameplay input with jump/dash/attack buffering and shared controller actions. */
export class InputManager {
  private actions: ActionInput;
  private scene: Phaser.Scene;
  jumpBufferMs = 0;
  dashBufferMs = 0;
  attackBufferMs = 0;
  dashAim = 0;
  attackAim = 0;
  private get aim(): number { return this.up ? -1 : this.down ? 1 : 0; }
  pressedPause = false;
  pressedRestart = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.actions = new ActionInput();
    scene.input.keyboard?.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]);
  }

  update(dtMs: number): void {
    this.jumpBufferMs = Math.max(0, this.jumpBufferMs - dtMs);
    this.attackBufferMs = Math.max(0, this.attackBufferMs - dtMs);
    this.dashBufferMs = Math.max(0, this.dashBufferMs - dtMs);
    this.actions.update();
    if (this.actions.consume('jump')) this.jumpBufferMs = 135;
    if (this.actions.consume('attack')) { this.attackBufferMs = 140; this.attackAim = this.aim; }
    if (this.actions.consume('dash')) { this.dashBufferMs = 140; this.dashAim = this.aim; }
    if (this.actions.consume('pause')) this.pressedPause = true;
    if (this.actions.consume('restart')) this.pressedRestart = true;
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

  /** Consume a one-frame confirm/back/left/right action for scene-owned screens. */
  consumeAction(action: Action): boolean { return this.actions.consume(action); }
  heldAction(action: Action): boolean { return this.actions.held(action); }
  clearFrameFlags(): void {
    this.pressedPause = false;
    this.pressedRestart = false;
    this.actions.endFrame();
  }

  get horizontal(): number { return this.actions.horizontal; }

  get up(): boolean { return this.actions.up; }
  get down(): boolean { return this.actions.down; }
  get jumpHeld(): boolean { return this.actions.held('jump') || this.actions.held('confirm'); }
  get attackHeld(): boolean { return this.actions.held('attack'); }

  reset(): void {
    this.jumpBufferMs = 0; this.dashBufferMs = 0; this.attackBufferMs = 0;
    this.clearFrameFlags(); this.actions.flush();
    this.scene.input.keyboard?.resetKeys();
  }

  destroy(): void {
    this.reset();
    this.actions.destroy();
  }
}
