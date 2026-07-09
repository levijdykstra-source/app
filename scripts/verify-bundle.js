const fs = require('fs');
const path = require('path');

// Guard: renderer bundles must be plain browser IIFEs with NO CommonJS. If a
// build ever regresses to CommonJS output, this fails the build here — in CI,
// BEFORE electron-builder packages it — instead of shipping a "exports is not
// defined" installer.
const rendererDir = path.join(__dirname, '..', 'dist', 'renderer');
const entries = ['settings.js', 'recorder.js', 'overlay.js'];

const forbidden = [
  { name: 'CommonJS exports wrapper', re: /Object\.defineProperty\(exports/ },
  { name: 'module.exports', re: /module\.exports/ },
  { name: 'require() call', re: /(^|[^.\w])require\(/ }
];

let failed = false;
for (const entry of entries) {
  const file = path.join(rendererDir, entry);
  if (!fs.existsSync(file)) {
    console.error(`verify-bundle: missing expected bundle ${entry}`);
    failed = true;
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  for (const { name, re } of forbidden) {
    if (re.test(src)) {
      console.error(`verify-bundle: ${entry} contains CommonJS (${name}) — renderer must be a browser IIFE.`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log(`verify-bundle: OK — ${entries.length} renderer bundles are CommonJS-free.`);
