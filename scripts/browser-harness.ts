import { chromium, type Browser } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

export const option = (name: string, fallback: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Keep evidence for each run and release its private web build when finished. */
export async function prepareBrowserRun(name: string, port: number, metadata: Record<string, unknown>) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use a valid --port.');
  const parent = `artifacts/${name}`;
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(`${parent}/${new Date().toISOString().replaceAll(':', '-')}-`);
  const site = `${directory}/site`;
  const url = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  let server: ChildProcess | undefined;
  const close = async () => {
    server?.kill('SIGTERM');
    try { await browser?.close(); }
    finally { await rm(site, { recursive: true, force: true }); }
  };

  try {
    execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'inherit' });
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', site], { stdio: 'inherit' });
    const entry = await readFile(`${site}/index.html`, 'utf8');
    await writeFile(`${directory}/build.json`, JSON.stringify({
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
      entrySha256: createHash('sha256').update(entry).digest('hex'), ...metadata,
    }, null, 2));
    browser = await chromium.launch();
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', site, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let serverError = '';
    server.stderr?.on('data', chunk => { serverError = (serverError + String(chunk)).slice(-5000); });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(serverError || 'Acceptance server stopped before it was ready.');
      try {
        const response = await fetch(url);
        if (response.ok && await response.text() === entry) return { browser, directory, url, close };
      } catch { /* Wait for the local server. */ }
      await delay(100);
    }
    throw new Error('Acceptance server did not serve the expected build.');
  } catch (error) { await close(); throw error; }
}
