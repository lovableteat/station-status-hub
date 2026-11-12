const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const services = path.join(__dirname, 'pcbRecoveryServices.js');
const probe = path.join(__dirname, 'pcbRecoveryWorkspaceProbe.jsx');
const aliases = new Set(['@/integrations/supabase/client', '@/hooks/usePermissions', '@/components/auth/UserContext', '@/hooks/use-toast']);

async function buildPcbRecoveryFixture() {
  const build = await require('esbuild').build({
    absWorkingDir: root, entryPoints: ['tests/support/pcbRecoveryFixture.jsx'],
    bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser',
    outfile: 'pcb-recovery.js', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'isolated-pcb-boundaries', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (aliases.has(args.path)) return { path: services };
        if (args.path === './hooks/usePcbWorkspace.ts') return { path: probe };
        if (args.path === './hooks/usePcbProjectPresence.ts') return { path: services };
        // CAD import / STEP previews / WebGL are not part of auth recovery.
        // Keep the actual 2D canvas, toolbar, dialogs and workspace unchanged.
        if (args.path === './Pcb3DCanvas.tsx' || args.path === './PcbStepModelDialog.tsx' || args.path === '../data-center/stepImport.ts') {
          return { path: args.path, namespace: 'unexercised-cad' };
        }
        if (args.path.startsWith('@/')) return builder.resolve(path.join(root, 'src', args.path.slice(2)), { resolveDir: root, kind: args.kind });
      });
      builder.onLoad({ filter: /.*/, namespace: 'unexercised-cad' }, () => ({ loader: 'js', contents: `
        export function Pcb3DCanvasSafe() { throw new Error('WebGL is outside the auth recovery fixture'); }
        export function PcbStepModelDialog() { return null; }
        export async function importStepModel() { throw new Error('No CAD import in the auth recovery fixture'); }
      ` }));
    } }],
  });
  const inputs = Object.keys(build.metafile.inputs);
  for (const file of [
    'src/components/pcb-designer/PcbDesignerWorkspace.tsx',
    'src/components/pcb-designer/PcbCanvas.tsx',
    'src/components/pcb-designer/PcbToolbar.tsx',
    'src/components/pcb-designer/PcbDialogs.tsx',
    'src/components/pcb-designer/hooks/usePcbWorkspace.ts',
    'src/components/pcb-designer/hooks/usePcbPersistence.ts',
    'src/components/pcb-designer/hooks/usePcbProjectLock.ts',
    'src/components/pcb-designer/hooks/usePcbRemoteAccess.ts',
    'src/components/pcb-designer/core/accountRemoteSync.ts',
    'src/components/pcb-designer/core/legacyWorkspace.ts',
    'src/components/pcb-designer/core/remoteAccess.ts',
    'src/components/pcb-designer/core/remoteSync.ts',
    'src/components/pcb-designer/core/storage.ts',
    'src/lib/workspaceHistory.ts',
  ]) assert.ok(inputs.includes(file), `Real production source is bundled: ${file}`);
  assert.ok(!inputs.some(file => file.startsWith('src/integrations/supabase/')), 'The live Supabase client/config cannot enter the fixture');
  assert.ok(!inputs.some(file => file.includes('node_modules/@supabase/')), 'No Supabase SDK/network implementation enters the fixture');
  assert.deepEqual(Object.values(build.metafile.outputs).flatMap(output => output.imports), [], 'The entire fixture is self-contained with no runtime imports');
  const { default: postcssConfig } = await import(pathToFileURL(path.join(root, 'postcss.config.js')).href);
  const appCss = await require('postcss')(postcssConfig.plugins).process(fs.readFileSync(path.join(root, 'src/index.css'), 'utf8'), { from: path.join(root, 'src/index.css') });
  return {
    javascript: build.outputFiles.find(file => file.path.endsWith('.js')).text,
    css: appCss.css + '\n' + build.outputFiles.find(file => file.path.endsWith('.css')).text,
    inputs: inputs.filter(file => file.startsWith('src/')), aliases: [...aliases],
  };
}

module.exports = { buildPcbRecoveryFixture };
