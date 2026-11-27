import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { CHARACTERS, COURIERS } from '../data/characters';
import { SaveManager } from '../systems/SaveManager';
import { AudioManager } from '../systems/AudioManager';
import { Menu } from '../ui/Menu';
import { bindMenuGamepad } from '../ui/MenuInput';

export class CharacterScene extends Phaser.Scene {
  private from = 'Title';
  private status!: Phaser.GameObjects.Text;
  private quip!: Phaser.GameObjects.Text;
  constructor() { super('Characters'); }
  init(data: { from?: string }): void { this.from = data?.from ?? 'Title'; }
  create(): void {
    this.add.rectangle(0, 0, 480, 270, 0x0b1020, 0.98).setOrigin(0);
    this.add.text(240, 24, 'CHOOSE YOUR COURIER', { fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#f0c060' }).setOrigin(0.5);
    const locked = !SaveManager.get().cloverUnlocked;
    COURIERS.forEach((id, i) => {
      const c = CHARACTERS[id], y = 46 + i * 33;
      this.add.sprite(56, y + 12, c.sheet).setOrigin(0.5, 35 / 45).play(`${c.sheet}-idle`).setAlpha(id === 'clover' && locked ? 0.5 : 1);
      this.add.text(118, y + 13, c.trait, { fontFamily: FONT_SMALL, fontSize: '6px', color: '#bed0dc' });
    });
    const menu = new Menu(this, COURIERS.map(id => ({ disabled: id === 'clover' && locked, label: `${CHARACTERS[id].name}  /  ${id === 'clover' && locked ? 'UNLOCK AT LEVEL 2' : CHARACTERS[id].species}`, action: () => {
      SaveManager.selectCharacter(id); AudioManager.sfx('select', { volume: 0.4 }); this.refresh();
    } })), { x: 118, y: 46, spacing: 33, fontSize: '8px', align: 'left', showHints: false });
    bindMenuGamepad(this, menu, { onBack: () => this.close() });
    this.status = this.add.text(240, 210, '', { fontFamily: FONT_SMALL, fontSize: '8px', color: '#9ff5ff' }).setOrigin(0.5);
    this.quip = this.add.text(240, 225, '', { fontFamily: FONT_SMALL, fontSize: '6px', color: '#f0c060' }).setOrigin(0.5);
    this.add.text(240, 248, 'BACK', { fontFamily: FONT_SMALL, fontSize: '9px', color: '#f4e6c8', padding: { x: 40, y: 6 } }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); else menu.handleKey(e); };
    this.input.keyboard?.on('keydown', onKey); this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
    this.refresh();
  }
  private refresh(): void {
    const c = CHARACTERS[SaveManager.get().selectedCharacter];
    this.status.setText(`${c.name} SELECTED — APPLIES TO YOUR NEXT STAGE`);
    this.quip.setText(c.quip);
  }
  private close(): void { this.scene.stop(); this.scene.resume(this.from); }
}
