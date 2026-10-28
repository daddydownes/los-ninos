import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('Use Node.js 24 or newer for the local checkout database.');
  process.exit(1);
}
const candidates = process.env.PYTHON
  ? [[process.env.PYTHON, []]]
  : [['python3', []], ['python', []], ['py', ['-3']]];
const python = candidates.find(([command, args]) =>
  spawnSync(command, [...args, '-c', 'import sys; assert sys.version_info >= (3, 11)'], {stdio: 'ignore'}).status === 0);
if (!python) {
  console.error('Install Python 3.11 or newer, or set PYTHON to its executable path.');
  process.exit(1);
}
const build = spawnSync(python[0], [...python[1], 'scripts/build-film-demo.py'], {cwd: root, stdio: 'inherit'});
if (build.status !== 0) process.exit(build.status || 1);
if (process.argv.includes('--build-only')) process.exit(0);

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function start(script, args = [], env = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: root, stdio: 'inherit', env: {...process.env, ...env}, windowsHide: true,
  });
  children.push(child);
  child.on('error', error => {console.error(error.message); stop(1);});
  child.on('exit', code => {if (!stopping) stop(code || 0);});
}
start('scripts/commerce-local.mjs', ['--film'], {PORT: process.env.LOS_NINOS_FILM_PORT || '8793'});
start('demo/zoom-storefront/server.mjs');
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('Latest demo: http://127.0.0.1:' + (process.env.LOS_NINOS_PREVIEW_PORT || '8796') + '/');
console.log('Local preview only. Checkout uses a local database and sends no real emails. Ctrl+C stops both servers.');
