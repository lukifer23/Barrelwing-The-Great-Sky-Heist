import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './game/config';
import { BootScene } from './game/scenes/BootScene';
import { PreloadScene } from './game/scenes/PreloadScene';
import { TitleScene } from './game/scenes/TitleScene';
import { WorldMapScene } from './game/scenes/WorldMapScene';
import { GameScene } from './game/scenes/GameScene';
import { ResultsScene } from './game/scenes/ResultsScene';
import { EndingScene } from './game/scenes/EndingScene';
import { PauseScene } from './game/scenes/PauseScene';
import { SettingsScene } from './game/scenes/SettingsScene';
import { ControlsScene } from './game/scenes/ControlsScene';
import { CreditsScene } from './game/scenes/CreditsScene';
import { SkySprintScene } from './game/scenes/SkySprintScene';
import { WorkshopScene } from './game/scenes/WorkshopScene';
import { SaveManager } from './game/systems/SaveManager';
import { installViewport } from './game/systems/Viewport';
import { installNativePlatform } from './game/systems/NativePlatform';
import { installTouchControls } from './game/systems/TouchControls';
import { AudioManager } from './game/systems/AudioManager';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game',
  backgroundColor: '#070a14',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    fullscreenTarget: 'app',
  },
  input: { activePointers: 4 },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 760 },
      debug: false,
      fps: 60,
    },
  },
  fps: { target: 60, forceSetTimeOut: false },
  scene: [
    BootScene, PreloadScene, TitleScene, WorldMapScene, GameScene,
    PauseScene, ResultsScene, EndingScene, SettingsScene, ControlsScene,
    CreditsScene, SkySprintScene, WorkshopScene,
  ],
};

const game = new Phaser.Game(config);
game.registry.set('saves', SaveManager);
AudioManager.bind(game);
installTouchControls(game);
installViewport(game);
void installNativePlatform(game);

// unlock audio on the first interaction (browser autoplay policy)
const unlock = () => {
  AudioManager.unlock();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyM') {
    SaveManager.patchSettings({ muted: !SaveManager.get().settings.muted });
    AudioManager.refreshVolumes();
  }
  if (e.code === 'KeyF') {
    if (game.scale.isFullscreen) game.scale.stopFullscreen(); else game.scale.startFullscreen();
  }
});

// prevent arrow/space scrolling outside the canvas
window.addEventListener('keydown', (e) => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
}, { passive: false });

// exposed for local debugging and smoke checks
(window as unknown as { __game: Phaser.Game }).__game = game;
