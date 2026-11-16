import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

export const option = (name: string, fallback: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Run acceptance checks against an immutable, attributable production copy. */
export async function prepareBrowserRun(name: string, port: number, metadata: Record<string, unknown>) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use a valid --port.');
  const directory = `artifacts/${name}/${new Date().toISOString().replaceAll(':', '-')}`;
  const url = `http://127.0.0.1:${port}`;
  await mkdir(directory, { recursive: true });
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', `${directory}/site`], { stdio: 'inherit' });
  await writeFile(`${directory}/build.json`, JSON.stringify({
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), ...metadata,
  }, null, 2));
  const browser = await chromium.launch();
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', `${directory}/site`, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let serverError = '';
  server.stderr.on('data', chunk => { serverError = (serverError + String(chunk)).slice(-5000); });
  const close = async () => { server.kill('SIGTERM'); await browser.close(); };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(serverError || 'Acceptance server stopped before it was ready.');
      try { if ((await fetch(url)).ok) return { browser, directory, url, close }; } catch { /* Wait for the local server. */ }
      await delay(100);
    }
    throw new Error('Acceptance server did not become ready.');
  } catch (error) { await close(); throw error; }
}
