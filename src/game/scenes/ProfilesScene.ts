import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { courierLevel, PROFILE_SLOTS, SaveManager } from '../systems/SaveManager';
import { CHARACTERS } from '../data/characters';
import { Menu } from '../ui/Menu';

export class ProfilesScene extends Phaser.Scene {
  constructor() { super('Profiles'); }

  create(): void {
    const save = SaveManager.get();
    this.add.rectangle(0, 0, 480, 270, 0x101528).setOrigin(0);
    this.add.text(240, 28, 'LOCAL PLAYERS', { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#f4e6c8' }).setOrigin(0.5);
    this.add.text(240, 52, 'Each player keeps a campaign, workshop and match record.', { fontFamily: FONT_SMALL, fontSize: '8px', color: '#bed0dc' }).setOrigin(0.5);
    const items = PROFILE_SLOTS.map((slot, i) => {
      const profile = slot === save.slot ? save : save.otherProfiles[slot];
      const y = 80 + i * 50;
      this.add.rectangle(240, y + 8, 394, 43, 0x1d2540).setStrokeStyle(1, slot === save.slot ? 0xf0c060 : 0x3a4460);
      const detail = profile
        ? `${CHARACTERS[profile.selectedCharacter].name}   /   LEVEL ${courierLevel(profile).level}   /   STAGE ${profile.unlocked}   /   ${profile.brawl.wins} BRAWL WINS`
        : 'Start a new delivery record';
      this.add.text(78, y + 11, detail, { fontFamily: FONT_SMALL, fontSize: '7px', color: '#9ff5ff' });
      return { label: `PLAYER ${slot}${slot === save.slot ? '   /   ACTIVE' : ''}`, action: () => {
        SaveManager.switchProfile(slot);
        this.scene.start('Title');
      } };
    });
    items.push({ label: 'BACK TO TITLE', action: () => this.scene.start('Title') });
    const menu = new Menu(this, items, { x: 78, y: 80, spacing: 50, align: 'left', fontSize: '9px', showHints: false });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.scene.start('Title'); else menu.handleKey(e); };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }
}
