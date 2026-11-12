import sharp from 'sharp';
import fs from 'node:fs/promises';

const source = new URL('../branding/barrelwing-icon.png', import.meta.url);
await sharp(source.pathname).resize(256, 256).png().toFile('public/assets/ui/app-icon.png');
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const dir = `android/app/src/main/res/mipmap-${density}`;
  await fs.mkdir(dir, { recursive: true });
  await sharp(source.pathname).resize(size, size).png().toFile(`${dir}/ic_launcher.png`);
  await sharp(source.pathname).resize(size, size).png().toFile(`${dir}/ic_launcher_round.png`);
  // An inset square foreground retains the character inside adaptive masks.
  const foreground = Math.round(size * 108 / 48);
  const inset = Math.round(foreground * 0.17);
  const art = await sharp(source.pathname).resize(foreground - inset * 2, foreground - inset * 2).png().toBuffer();
  await sharp({ create: { width: foreground, height: foreground, channels: 4, background: '#073355' } })
    .composite([{ input: art, left: inset, top: inset }]).png().toFile(`${dir}/ic_launcher_foreground.png`);
}
console.log('Browser and Android icons built.');
