import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const mode = process.argv[2] ?? 'build';
const env = { ...process.env };
if (process.platform === 'darwin') {
  {
    try { env.JAVA_HOME = execFileSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' }).trim(); } catch { /* Gradle will report the missing JDK. */ }
  }
  env.ANDROID_HOME ??= path.join(homedir(), 'Library', 'Android', 'sdk');
}
if (env.ANDROID_HOME && !existsSync('android/local.properties')) {
  writeFileSync('android/local.properties', `sdk.dir=${env.ANDROID_HOME.replaceAll('\\', '/') }\n`);
}
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
run('npm', ['run', 'build']);
run('npx', ['cap', 'sync', 'android']);
run(process.platform === 'win32' ? 'android\\gradlew.bat' : './android/gradlew', ['-p', 'android', 'assembleDebug']);
mkdirSync('artifacts', { recursive: true });
copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', 'artifacts/barrelwing-debug.apk');
if (mode === 'install') {
  const serial = env.ANDROID_SERIAL ? ['-s', env.ANDROID_SERIAL] : [];
  run('adb', [...serial, 'install', '-r', 'artifacts/barrelwing-debug.apk']);
  run('adb', [...serial, 'shell', 'am', 'start', '-n', 'com.barrelwing.skyheist/.MainActivity']);
}
console.log('APK: artifacts/barrelwing-debug.apk');
