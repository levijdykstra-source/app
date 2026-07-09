const path = require('path');
const esbuild = require('esbuild');
const pkg = require('../package.json');

// Bundle each renderer entry into a self-contained browser IIFE. This is the
// key fix for "exports is not defined": the output has no CommonJS module
// wrapper and no Node imports — `../shared/types` is inlined, and all
// Electron/IPC access happens through window.whisper (exposed by the preload).
const root = path.join(__dirname, '..');
const entries = ['settings', 'recorder', 'overlay'].map((name) =>
  path.join(root, 'src', 'renderer', `${name}.ts`)
);

esbuild
  .build({
    entryPoints: entries,
    outdir: path.join(root, 'dist', 'renderer'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
    // Bake the app version into the bundle so the UI can show which build is
    // running — makes "am I on the fixed version?" unambiguous.
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    logLevel: 'info'
  })
  .then(() => console.log('Bundled renderer entries into dist/renderer/'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
