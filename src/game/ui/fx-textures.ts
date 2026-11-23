import Phaser from 'phaser';

/** Generates the tiny transient-FX textures the game reuses everywhere. */
export function createFxTextures(scene: Phaser.Scene): void {
  // A folded oilskin with brass clasps, drawn at the pickup's native pixel size.
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const colors: Record<string, number> = { A: 0x152f38, B: 0x368575, C: 0x81e0bb, D: 0xffda78 };
  const coat = [
      '......AAAA......', '.....ACCCCA.....', '....ACABBACA....', '...ACCCDDCCCA...',
      '..ACCBCDDBCBCA..', '.ACCBBCBBBCBBCA.', '.ACBBBCDDBCBCCA.', '.ABABBCBBBCBABA.',
      '..A.ABCBBBCBA.A.', '....ABCDDBCBA...', '...ACBCBBBCBCA..', '...ABBCBBBCBBA..',
      '..ACBBCBBBCBBCA.', '..ACCCCAAACCCCA.', '...AAAA...AAAA..',
  ];
  coat.forEach((row, y) => Array.from(row).forEach((pixel, x) => {
    if (pixel !== '.') g.fillStyle(colors[pixel]).fillRect(x, y, 1, 1);
  }));
  g.generateTexture('power_stormcoat', 16, 16);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture('fx_puff', 8, 8);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 3, 3);
  g.generateTexture('fx_spark', 3, 3);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 10, 2);
  g.generateTexture('fx_streak', 10, 2);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 1, 1);
  g.generateTexture('fx_px', 1, 1);
  // Draw two low-resolution cels per hazard. The translucent column marks
  // the whole contact area while the bright core shows the discharge.
  const arc = (ox: number, points: number[][], color: number, thickness: number) => {
    g.fillStyle(color, 1);
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let j = 0; j <= steps; j++) {
        g.fillRect(ox + Math.round(x0 + (x1 - x0) * j / steps), Math.round(y0 + (y1 - y0) * j / steps), thickness, 1);
      }
    }
  };
  g.clear();
  for (let i = 0; i < 2; i++) {
    const ox = i * 24;
    g.fillStyle(0x91ceff, 0.23).fillRect(ox, 0, 24, 90);
    const bolt = i ? [[10,0],[17,18],[10,32],[14,31],[5,52],[11,50],[8,70],[15,89]]
      : [[14,0],[8,18],[12,17],[7,38],[16,50],[10,63],[14,62],[10,89]];
    arc(ox, bolt, 0x65bcff, 4);
    arc(ox + 1, bolt, 0xfffcdf, 2);
    arc(ox, i ? [[10,32],[4,37],[2,47]] : [[16,50],[21,56],[19,66]], 0xb6e6ff, 1);
  }
  g.generateTexture('hazard_lightning', 48, 90);
  const lightning = scene.textures.get('hazard_lightning');
  lightning.add('a', 0, 0, 0, 24, 90); lightning.add('b', 0, 24, 0, 24, 90);
  g.clear();
  for (let i = 0; i < 2; i++) {
    const ox = i * 12;
    g.fillStyle(0xcfe8ed, 0.22).fillRect(ox, 0, 12, 52);
    for (let j = 0; j < 7; j++) {
      const y = 5 + j * 7, x = 6 + ((j + i) % 2 ? 2 : -2), r = j < 4 ? 4 : 3;
      g.fillStyle(0x97bdc8, 0.85).fillCircle(ox + x, y + 1, r);
      g.fillStyle(0xfff4dd, 0.94).fillCircle(ox + x, y - 1, r - 1);
    }
    g.fillStyle(0xfff6dd).fillRect(ox + 5, 46, 3, 6);
  }
  g.generateTexture('hazard_steam', 24, 52);
  const steam = scene.textures.get('hazard_steam');
  steam.add('a', 0, 0, 0, 12, 52); steam.add('b', 0, 12, 0, 12, 52);
  g.destroy();

  // radial glow via canvas (transient FX only)
  const key = 'fx_glow';
  if (!scene.textures.exists(key)) {
    const canvas = scene.textures.createCanvas(key, 48, 48);
    if (canvas) {
      const ctx = canvas.getContext();
      const grad = ctx.createRadialGradient(24, 24, 1, 24, 24, 23);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 48, 48);
      canvas.refresh();
    }
  }
}
