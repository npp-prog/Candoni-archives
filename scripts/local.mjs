// `npm run local`: runs Candoni Archives on your computer with no Firebase project needed.
// 1. Starts the Firebase emulators (local Auth, Firestore and Storage) with the real security rules.
// 2. Loads demo accounts (first run only).
// 3. Starts the app at http://localhost:5173.
// Data is saved to .emulator-data when you press Ctrl+C, and loaded again next time. Needs Java 21+.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const win = process.platform === 'win32';
const DATA = '.emulator-data';
const children = [];
const start = (cmd, args, opts = {}) => { const c = spawn(cmd, args, { shell: win, ...opts }); children.push(c); return c; };

const emuArgs = ['-y', 'firebase-tools@15.34.1', 'emulators:start', '--only', 'auth,firestore,storage', '--project', 'demo-archives', '--export-on-exit', DATA];
if (existsSync(DATA)) emuArgs.push('--import', DATA);

console.log('\n[Archives] Starting the local Firebase emulators (the first run downloads them, about a minute)…\n');
const emu = start('npx', emuArgs, { stdio: ['inherit', 'pipe', 'inherit'] });
let ready = false;
emu.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!ready && text.includes('All emulators ready')) { ready = true; onReady(); }
});
emu.on('exit', (code) => {
  if (!ready) console.error('\n[Archives] The emulators stopped before they were ready. Is Java 21 or newer installed? Run: java -version');
  children.forEach((c) => c !== emu && c.kill());
  process.exit(code ?? 0);
});

function onReady() {
  const seed = start('node', ['scripts/seed-local.mjs'], { stdio: 'inherit' });
  seed.on('exit', () => {
    console.log('\n[Archives] Open http://localhost:5173. Sign in as npp@mgocandoniaccounting.org / admin123 (superadmin),');
    console.log('           records@archives.local / records123 (Records Officer) or viewer@archives.local / viewer123 (Viewer).\n');
    start('npx', ['vite', '--mode', 'emulator', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
  });
}

const stop = () => { children.forEach((c) => c.kill('SIGINT')); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
