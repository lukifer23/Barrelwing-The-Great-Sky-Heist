import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  stdio: 'inherit',
  env: { ...process.env, BARRELWING_PRODUCTION: '1' },
});
