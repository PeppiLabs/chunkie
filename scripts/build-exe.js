import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const launcherDir = path.join(rootDir, 'src', 'launcher');
const targetDistDir = path.join(launcherDir, 'dist');
const outExe = path.join(rootDir, 'chunkie.exe');

console.log('[Build] 1. Building production frontend bundle (npm run build)...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

if (!fs.existsSync(distDir)) {
  console.error('[Build ERROR] dist directory not found!');
  process.exit(1);
}

console.log('[Build] 2. Staging dist into launcher directory...');
fs.cpSync(distDir, targetDistDir, { recursive: true });

try {
  console.log('[Build] 3. Compiling standalone chunkie.exe with Go...');
  execSync(`go build -ldflags="-s -w" -o "${outExe}" .`, {
    cwd: launcherDir,
    stdio: 'inherit',
  });
  const stat = fs.statSync(outExe);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`\n[SUCCESS] Successfully compiled ${outExe} (${sizeMb} MB)`);
  console.log('The executable is 100% standalone and embeds all assets.');
} finally {
  console.log('[Build] 4. Cleaning up staged files...');
  fs.rmSync(targetDistDir, { recursive: true, force: true });
}
