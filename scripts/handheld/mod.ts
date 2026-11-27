/**
 * Original four-channel ProTracker module for the GBA Sky Sprint loop.
 * The score is generated from the same short pattern in source, so the
 * binary is deterministic and has no external sample/tracker dependency.
 */
const TITLE = 'Barrelwing Sprint';
const SAMPLE_RATE = 8363;

function period(note: number): number {
  // note 0 = C-1. MOD periods are rounded from the equal-tempered table.
  return Math.round(1712 * 2 ** (-note / 12));
}

function square(bytes: number, duty = 0.5): Buffer {
  const out = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) out[i] = (i % bytes) / bytes < duty ? 72 : 184;
  return out;
}

function triangle(bytes: number): Buffer {
  const out = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) {
    const phase = (i % bytes) / bytes;
    out[i] = 128 + Math.round((phase < 0.5 ? phase * 2 : 2 - phase * 2) * 100 - 100);
  }
  return out;
}

function noise(bytes: number): Buffer {
  const out = Buffer.alloc(bytes);
  let state = 0x12345678;
  for (let i = 0; i < bytes; i++) {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    out[i] = (state & 0xff) - 128;
  }
  return out;
}

function sampleHeader(name: string, data: Buffer, loop = true): Buffer {
  const header = Buffer.alloc(30);
  header.write(name.slice(0, 22).padEnd(22, ' '), 0, 'ascii');
  header.writeUInt16BE(Math.floor(data.length / 2), 22);
  header[24] = 0;
  header[25] = 64;
  header.writeUInt16BE(0, 26);
  header.writeUInt16BE(loop ? Math.floor(data.length / 2) : 0, 28);
  return header;
}

function cell(sample: number, notePeriod: number, effect = 0, param = 0): number {
  const b0 = ((sample & 0xf0) | ((notePeriod >> 8) & 0x0f)) & 0xff;
  const b1 = notePeriod & 0xff;
  const b2 = (((sample & 0x0f) << 4) | (effect & 0x0f)) & 0xff;
  return (b0 << 24) | (b1 << 16) | (b2 << 8) | (param & 0xff);
}

function pattern(): Buffer {
  const rows = 64;
  const buf = Buffer.alloc(rows * 4 * 4);
  const bass = [0, 0, 5, 5, 3, 3, 7, 7]; // C, F, D#, G
  const lead = [12, 16, 19, 24, 19, 16, 12, 7];
  const arp = [24, 28, 31, 36, 31, 28, 24, 19];
  for (let row = 0; row < rows; row++) {
    const offset = row * 16;
    if (row % 4 === 0) buf.writeUInt32BE(cell(2, period(bass[Math.floor(row / 8) % bass.length]), 0x0c, 40), offset);
    if (row % 2 === 0) buf.writeUInt32BE(cell(1, period(lead[Math.floor(row / 4) % lead.length] + 12), 0x0c, 50), offset + 4);
    if (row % 2 === 1) buf.writeUInt32BE(cell(1, period(arp[Math.floor(row / 4) % arp.length] + 12), 0x0c, 32), offset + 8);
    if (row % 8 === 0) buf.writeUInt32BE(cell(3, 428, 0x0c, row % 16 === 0 ? 52 : 32), offset + 12);
  }
  return buf;
}

export function buildSprintModule(): Buffer {
  const samples = [square(32), triangle(64), noise(256)];
  const header = Buffer.alloc(20);
  header.write(TITLE.padEnd(20, ' '), 0, 'ascii');
  const sampleHeaders = samples.map((data, i) => sampleHeader(['square', 'triangle', 'noise'][i], data, i < 2));
  const count = 2;
  const song = Buffer.alloc(2);
  song[0] = count;
  song[1] = 0;
  const table = Buffer.alloc(128);
  for (let i = 0; i < count; i++) table[i] = i % 2;
  const signature = Buffer.from('M.K.', 'ascii');
  const patterns = Buffer.concat([pattern(), pattern()]);
  const sampleData = Buffer.concat(samples);
  return Buffer.concat([header, ...sampleHeaders, song, table, signature, patterns, sampleData]);
}

export function sprintModuleInfo(): { title: string; channels: number; patterns: number; sampleRate: number } {
  return { title: TITLE, channels: 4, patterns: 2, sampleRate: SAMPLE_RATE };
}
